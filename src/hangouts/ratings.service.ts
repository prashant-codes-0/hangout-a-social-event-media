import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Hangout, HangoutStatus } from './schemas/hangout.schema';
import { HangoutRating } from './schemas/hangout-rating.schema';
import { RateHangoutDto } from './dto/rating.dto';
import { User, UserBadge } from '../auth/schemas/user.schema';

interface BadgeStats {
  attended: number;
  hosted: number;
  given: number;
  ratingCount: number;
  ratingAvg: number;
}

interface BadgeRule {
  key: string;
  name: string;
  icon: string;
  test: (stats: BadgeStats) => boolean;
}

// Reputation badges: deterministic rules re-evaluated after every rating batch
const BADGE_RULES: BadgeRule[] = [
  { key: 'first_hangout', name: 'First Hangout', icon: '🎉', test: s => s.attended >= 1 },
  { key: 'regular', name: 'Regular', icon: '⭐', test: s => s.attended >= 5 },
  { key: 'host', name: 'Host', icon: '🏠', test: s => s.hosted >= 3 },
  { key: 'well_rated', name: 'Well Rated', icon: '🌟', test: s => s.ratingCount >= 5 && s.ratingAvg >= 4.5 },
  { key: 'contributor', name: 'Contributor', icon: '💬', test: s => s.given >= 10 },
];

// Post-hangout ratings: score other attendees, maintain the user's reputation
@Injectable()
export class RatingsService {
  constructor(
    @InjectModel(Hangout.name) private hangoutModel: Model<Hangout>,
    @InjectModel(HangoutRating.name) private ratingModel: Model<HangoutRating>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  // Save my scores for everyone I picked; overwrites my earlier scores for this hangout
  async rate(hangoutId: string, raterId: string, dto: RateHangoutDto) {
    const hangout = await this.requireFinishedHangout(hangoutId);
    this.requireMember(hangout, raterId);

    const members = new Set([String(hangout.createdBy), ...hangout.attendees.map(String)]);
    const seen = new Set<string>();
    const operations: any[] = [];

    for (const item of dto.items) {
      if (item.userId === raterId) {
        throw new BadRequestException('You cannot rate yourself');
      }
      if (!members.has(item.userId)) {
        throw new BadRequestException('You can only rate people who were part of this hangout');
      }
      if (seen.has(item.userId)) {
        throw new BadRequestException('Each person can only appear once');
      }
      seen.add(item.userId);

      operations.push({
        updateOne: {
          filter: {
            hangoutId: hangout._id,
            raterId: new Types.ObjectId(raterId),
            ratedId: new Types.ObjectId(item.userId),
          },
          update: { $set: { score: item.score } },
          upsert: true,
        },
      });
    }

    if (operations.length) {
      await this.ratingModel.bulkWrite(operations);
      // Refresh each scored person's average and badges
      for (const userId of seen) {
        await this.recomputeReputation(userId);
      }
    }

    return { saved: operations.length };
  }

  // The scores I already gave for this hangout, to prefill the form
  async mine(hangoutId: string, raterId: string) {
    const rows = await this.ratingModel
      .find({ hangoutId: new Types.ObjectId(hangoutId), raterId: new Types.ObjectId(raterId) })
      .lean();
    return rows.map(row => ({ userId: String(row.ratedId), score: row.score }));
  }

  // Recompute a user's average rating and badges from scratch
  async recomputeReputation(userId: string) {
    const uid = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
    if (!uid) return;

    const [aggregate, attended, hosted, given, user] = await Promise.all([
      this.ratingModel.aggregate<{ count: number; avg: number }>([
        { $match: { ratedId: uid } },
        { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$score' } } },
      ]),
      this.hangoutModel.countDocuments({ attendees: uid, status: HangoutStatus.COMPLETED }),
      this.hangoutModel.countDocuments({ createdBy: uid, status: HangoutStatus.COMPLETED }),
      this.ratingModel.countDocuments({ raterId: uid }),
      this.userModel.findById(uid).select('badges').lean<{ badges?: Pick<UserBadge, 'key' | 'name' | 'icon' | 'earnedAt'>[] }>(),
    ]);

    const ratingCount = aggregate[0]?.count ?? 0;
    const ratingAvg = Math.round((aggregate[0]?.avg ?? 0) * 10) / 10;

    const existing = new Map((user?.badges ?? []).map(badge => [badge.key, badge]));
    const stats: BadgeStats = { attended, hosted, given, ratingCount, ratingAvg };
    const now = new Date();
    const badges = BADGE_RULES.filter(rule => rule.test(stats)).map(rule => ({
      key: rule.key,
      name: rule.name,
      icon: rule.icon,
      earnedAt: existing.get(rule.key)?.earnedAt ?? now,
    }));

    await this.userModel.updateOne(
      { _id: uid },
      { $set: { ratingAvg, ratingCount, badges } },
    );
  }

  // ---- Helpers ----

  private async requireFinishedHangout(hangoutId: string): Promise<Hangout> {
    if (!Types.ObjectId.isValid(hangoutId)) throw new NotFoundException('Hangout not found');
    const hangout = await this.hangoutModel.findById(hangoutId);
    if (!hangout) throw new NotFoundException('Hangout not found');
    if (hangout.status !== HangoutStatus.COMPLETED) {
      throw new BadRequestException('You can rate a hangout after it has finished');
    }
    return hangout;
  }

  private requireMember(hangout: Hangout, userId: string) {
    const isCreator = hangout.createdBy.toString() === userId;
    const isAttendee = hangout.attendees.some(id => id.toString() === userId);
    if (!isCreator && !isAttendee) {
      throw new ForbiddenException('Only people who were part of this hangout can rate it');
    }
  }
}
