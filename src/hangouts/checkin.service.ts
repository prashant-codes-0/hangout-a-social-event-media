import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { Hangout, HangoutStatus } from './schemas/hangout.schema';
import { HangoutCheckIn } from './schemas/hangout-checkin.schema';
import { User } from '../auth/schemas/user.schema';
import { CheckInDto, LiveLocationDto } from './dto/checkin.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { geoFromLocation, distanceKm } from './hangout-search';

// Proximity check-ins must land this close to the venue
const CHECK_IN_RADIUS_M = 150;
// Check-in opens 2 hours before the start and closes 2 hours after the scheduled end
const CHECK_IN_OPENS_EARLY_MS = 2 * 60 * 60 * 1000;
const CHECK_IN_CLOSES_LATE_MS = 2 * 60 * 60 * 1000;
// A shared position goes stale after this long without an update
const LIVE_LOCATION_TTL_MS = 90 * 1000;
// Codes are unambiguous characters (no 0/O/1/I/L)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export interface LivePoint {
  userId: string;
  name: string;
  lat: number;
  lng: number;
  updatedAt: string;
}

// Venue check-in (code or GPS proximity) and day-of live location sharing.
@Injectable()
export class CheckInService {
  // hangoutId -> userId -> last shared position (ephemeral, never persisted)
  private shares = new Map<string, Map<string, { lat: number; lng: number; at: number }>>();

  constructor(
    @InjectModel(Hangout.name) private hangoutModel: Model<Hangout>,
    @InjectModel(HangoutCheckIn.name) private checkInModel: Model<HangoutCheckIn>,
    @InjectModel(User.name) private userModel: Model<User>,
    private realtime: RealtimeService,
  ) {}

  // ---- Check-in codes ----

  // Organizer/admin: get the code attendees scan or type (rotates only when asked or expired)
  async ensureCode(hangoutId: string, userId: string, rotate = false, isAdmin = false) {
    const hangout = await this.requireHangout(hangoutId);
    if (!isAdmin && hangout.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the hangout organizer can show the check-in code');
    }

    const expiresAt = new Date(hangout.time.getTime() + hangout.durationMinutes * 60_000 + CHECK_IN_CLOSES_LATE_MS);
    if (!rotate && hangout.checkInCode && hangout.checkInCodeExpiresAt && hangout.checkInCodeExpiresAt > new Date()) {
      return { code: hangout.checkInCode, expiresAt: hangout.checkInCodeExpiresAt };
    }

    let code = this.generateCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await this.hangoutModel.exists({ checkInCode: code });
      if (!clash) break;
      code = this.generateCode();
    }
    await this.hangoutModel.updateOne(
      { _id: hangout._id },
      { $set: { checkInCode: code, checkInCodeExpiresAt: expiresAt } },
    );
    return { code, expiresAt };
  }

  // Attendee (or organizer): check in with the code, or with GPS near the venue
  async checkIn(hangoutId: string, userId: string, dto: CheckInDto) {
    const hangout = await this.requireHangout(hangoutId);
    this.requireMember(hangout, userId);
    this.requireWindow(hangout);

    let method: 'code' | 'geo';
    let distanceM: number | undefined;

    const code = dto.code?.trim().toUpperCase();
    const hasCoords = Number.isFinite(dto.lat) && Number.isFinite(dto.lng);
    if (code) {
      if (
        !hangout.checkInCode ||
        !hangout.checkInCodeExpiresAt ||
        hangout.checkInCodeExpiresAt <= new Date() ||
        hangout.checkInCode !== code
      ) {
        throw new BadRequestException('That check-in code is not valid');
      }
      method = 'code';
    } else if (hasCoords) {
      const venue = this.venuePoint(hangout);
      if (!venue) {
        throw new BadRequestException('This hangout has no map location for a proximity check-in');
      }
      distanceM = Math.round(distanceKm({ lat: dto.lat!, lng: dto.lng! }, venue) * 1000);
      if (distanceM > CHECK_IN_RADIUS_M) {
        throw new BadRequestException(
          `You are about ${distanceM} m away — check in within ${CHECK_IN_RADIUS_M} m of the venue`,
        );
      }
      method = 'geo';
    } else {
      throw new BadRequestException('Enter the check-in code or share your location to check in');
    }

    const checkIn = await this.checkInModel.findOneAndUpdate(
      { hangoutId: hangout._id, userId: new Types.ObjectId(userId) },
      { $set: { method, ...(distanceM != null ? { distanceM } : {}) } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await checkIn.populate('userId', 'name email');

    const points = await this.liveSnapshot(hangoutId);
    const checkedInCount = await this.checkInModel.countDocuments({ hangoutId: hangout._id });
    this.realtime.emitToRoom(`hangout_${hangoutId}`, 'checkedIn', {
      hangoutId,
      checkIn: { ...checkIn.toJSON(), checkedInAt: checkIn.createdAt },
      checkedInCount,
      livePoints: points,
    });

    return {
      checkIn: { ...checkIn.toJSON(), checkedInAt: checkIn.createdAt },
      checkedInCount,
    };
  }

  // Who is at the venue (members only)
  async list(hangoutId: string) {
    const [items, checkedInCount] = await Promise.all([
      this.checkInModel
        .find({ hangoutId: new Types.ObjectId(hangoutId) })
        .sort({ createdAt: 1 })
        .populate('userId', 'name email')
        .lean(),
      this.checkInModel.countDocuments({ hangoutId: new Types.ObjectId(hangoutId) }),
    ]);
    return { items, checkedInCount };
  }

  // ---- Live location (day-of) ----

  async share(hangoutId: string, userId: string, dto: LiveLocationDto) {
    const hangout = await this.requireHangout(hangoutId);
    this.requireMember(hangout, userId);
    this.requireWindow(hangout);

    let byHangout = this.shares.get(hangoutId);
    if (!byHangout) {
      byHangout = new Map();
      this.shares.set(hangoutId, byHangout);
    }
    byHangout.set(userId, { lat: dto.lat, lng: dto.lng, at: Date.now() });
    return this.emitSnapshot(hangoutId);
  }

  async stop(hangoutId: string, userId: string) {
    this.shares.get(hangoutId)?.delete(userId);
    return this.emitSnapshot(hangoutId);
  }

  async listLive(hangoutId: string) {
    return this.emitSnapshot(hangoutId, false);
  }

  // Current sharing positions with names; optionally tells the room
  private async emitSnapshot(hangoutId: string, broadcast = true): Promise<LivePoint[]> {
    const points = await this.liveSnapshot(hangoutId);
    if (broadcast) {
      this.realtime.emitToRoom(`hangout_${hangoutId}`, 'liveLocation', { hangoutId, points });
    }
    return points;
  }

  private async liveSnapshot(hangoutId: string): Promise<LivePoint[]> {
    const byHangout = this.shares.get(hangoutId);
    if (!byHangout?.size) return [];
    const cutoff = Date.now() - LIVE_LOCATION_TTL_MS;
    for (const [uid, point] of byHangout) {
      if (point.at < cutoff) byHangout.delete(uid);
    }
    if (!byHangout.size) return [];
    const users = await this.userModel
      .find({ _id: { $in: [...byHangout.keys()].map(id => new Types.ObjectId(id)) } })
      .select('name')
      .lean();
    const names = new Map(users.map(u => [String(u._id), u.name]));
    return [...byHangout].map(([uid, point]) => ({
      userId: uid,
      name: names.get(uid) ?? 'Someone',
      lat: point.lat,
      lng: point.lng,
      updatedAt: new Date(point.at).toISOString(),
    }));
  }

  // Old shares should not outlive their hangout's day
  @Cron(CronExpression.EVERY_MINUTE, { name: 'live-location-sweep' })
  sweepStaleShares() {
    const cutoff = Date.now() - LIVE_LOCATION_TTL_MS;
    for (const byHangout of this.shares.values()) {
      for (const [uid, point] of byHangout) {
        if (point.at < cutoff) byHangout.delete(uid);
      }
    }
  }

  // ---- Helpers ----

  private async requireHangout(hangoutId: string): Promise<Hangout> {
    if (!Types.ObjectId.isValid(hangoutId)) throw new NotFoundException('Hangout not found');
    const hangout = await this.hangoutModel.findById(hangoutId);
    if (!hangout) throw new NotFoundException('Hangout not found');
    if (hangout.status === HangoutStatus.CANCELLED) {
      throw new BadRequestException('This hangout was cancelled');
    }
    return hangout;
  }

  private requireMember(hangout: Hangout, userId: string) {
    const isCreator = hangout.createdBy.toString() === userId;
    const isAttendee = hangout.attendees.some(id => id.toString() === userId);
    if (!isCreator && !isAttendee) {
      throw new ForbiddenException('You must be part of this hangout to check in or share your location');
    }
  }

  // Day-of window: from 2 hours before the start until 2 hours after the scheduled end
  private requireWindow(hangout: Hangout) {
    const start = hangout.time.getTime();
    const end = start + hangout.durationMinutes * 60_000;
    const now = Date.now();
    if (now < start - CHECK_IN_OPENS_EARLY_MS) {
      throw new BadRequestException('Check-in opens 2 hours before the hangout starts');
    }
    if (now > end + CHECK_IN_CLOSES_LATE_MS) {
      throw new BadRequestException('Check-in is over for this hangout');
    }
  }

  // [lng, lat] of the venue, from the geo copy or the picked location
  private venuePoint(hangout: Hangout): { lat: number; lng: number } | undefined {
    const geo = hangout.geo ?? geoFromLocation(hangout.location);
    const [lng, lat] = geo?.coordinates ?? [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    return { lat, lng };
  }

  private generateCode(): string {
    let code = '';
    const bytes = randomBytes(CODE_LENGTH);
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return code;
  }
}
