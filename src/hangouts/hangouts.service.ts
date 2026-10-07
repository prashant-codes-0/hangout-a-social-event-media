import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../auth/schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import {
  CreateHangoutDto,
  UpdateHangoutDto,
  UpdateHangoutStatusDto,
} from './dto/hangout.dto';
import {
  deriveHangoutStatus,
  formatHangoutWhen,
  REMINDER_TOLERANCE_MS,
  REMINDER_WINDOWS,
} from './hangout-status';
import {
  containsText,
  distanceKm,
  geoFromLocation,
  NearFilter,
  nearQuery,
  normalizeTags,
  parseDate,
  parseNear,
} from './hangout-search';
import { HangoutLocation } from './schemas/hangout-location.schema';
import { Hangout, HangoutStatus } from './schemas/hangout.schema';

// Query params accepted by the public feed
export interface HangoutFeedFilters {
  q?: string;
  purpose?: string;
  place?: string;
  tags?: string;
  date?: string;
  from?: string;
  to?: string;
  lat?: string;
  lng?: string;
  radiusKm?: string;
  sort?: string;
  status?: string;
  includePast?: boolean | string;
}
import { JoinRequest, JoinRequestStatus } from './schemas/join-request.schema';

// Grace period before a "starting now" alert, so a server that was briefly down
// does not spam every past hangout back to life on restart.
const JUST_STARTED_WINDOW_MS = 30 * 60 * 1000;

const MINUTE = 60 * 1000;

@Injectable()
export class HangoutsService {
  private readonly logger = new Logger(HangoutsService.name);

  constructor(
    @InjectModel(Hangout.name)
    private hangoutModel: Model<Hangout>,
    @InjectModel(JoinRequest.name)
    private joinRequestModel: Model<JoinRequest>,
    @InjectModel(User.name)
    private userModel: Model<User>,
    private notifications: NotificationsService,
  ) {}

  // ---- Join request alerts (fire and forget; NotificationsService never throws) ----

  private async alertJoinRequest(hangout: Hangout, requesterId: string) {
    const requester = await this.userModel
      .findById(requesterId)
      .select('name')
      .lean();
    this.notifications.notify(hangout.createdBy.toString(), {
      type: NotificationType.JOIN_REQUEST,
      actorId: requesterId,
      hangoutId: String(hangout._id),
      title: 'New join request',
      body: `${requester?.name ?? 'Someone'} wants to join ${hangout.title}`,
      link: '/hangouts/manage',
    });
  }

  private alertJoinDecision(
    hangout: Hangout,
    requesterId: string,
    approved: boolean,
    decidedById: string,
  ) {
    this.notifications.notify(requesterId, {
      type: approved
        ? NotificationType.JOIN_APPROVED
        : NotificationType.JOIN_REJECTED,
      actorId: decidedById,
      hangoutId: String(hangout._id),
      title: approved ? "You're in! 🎉" : 'Join request declined',
      body: approved
        ? `Your request to join ${hangout.title} was approved`
        : `Your request to join ${hangout.title} wasn't accepted this time`,
      link: `/hangouts/details/${hangout._id}`,
    });
  }

  async create(createHangoutDto: CreateHangoutDto, userId: string) {
    // Role validation is now handled by VerifiedUserGuard at the controller level
    const start = new Date(createHangoutDto.time);

    if (isNaN(start.getTime())) {
      throw new BadRequestException('Hangout time is not a valid date');
    }

    // A minute of slack so "right now" is still creatable
    if (start.getTime() < Date.now() - MINUTE) {
      throw new BadRequestException('Hangout time must be in the future');
    }

    const durationMinutes = createHangoutDto.durationMinutes;

    const hangout = new this.hangoutModel({
      ...createHangoutDto,
      tags: normalizeTags(createHangoutDto.tags),
      geo: geoFromLocation(createHangoutDto.location as HangoutLocation),
      time: start,
      durationMinutes,
      status: deriveHangoutStatus(start, durationMinutes),
      remindersSent: [],
      createdBy: userId,
      attendees: [userId], // Creator automatically joins their own hangout
    });

    return hangout.save();
  }

  private buildFeedQuery(
    filters?: HangoutFeedFilters,
    options: { includePrivate: boolean } = { includePrivate: false },
    near?: NearFilter,
  ): Record<string, any> {
    const query: Record<string, any> = options.includePrivate
      ? {}
      : { isPublic: true };

    // Free-text search over what people actually read on a card
    if (filters?.q?.trim()) {
      const text = containsText(filters.q);
      query.$or = [
        { title: text },
        { description: text },
        { purpose: text },
        { place: text },
        { 'location.name': text },
        { tags: text },
      ];
    }

    if (filters?.purpose) {
      query.purpose = containsText(filters.purpose);
    }

    if (filters?.place) {
      query.place = containsText(filters.place);
    }

    // Comma-separated; a hangout must carry every requested tag
    const tags = normalizeTags(filters?.tags);
    if (tags.length) {
      query.tags = { $all: tags };
    }

    if (filters?.date) {
      const startDate = parseDate(filters.date, 'date')!;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);

      query.time = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    // Explicit range (the client computes "today", "this weekend"… in the viewer's time zone)
    const from = parseDate(filters?.from, 'from');
    const to = parseDate(filters?.to, 'to');
    if (from || to) {
      query.time = {
        ...(query.time ?? {}),
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lt: to } : {}),
      };
    }

    if (near) {
      query.geo = nearQuery(near);
    }

    const includePast =
      filters?.includePast === true || filters?.includePast === 'true';

    // An explicit status filter wins; otherwise hide finished events unless asked.
    if (filters?.status) {
      if (
        !Object.values(HangoutStatus).includes(filters.status as HangoutStatus)
      ) {
        throw new BadRequestException(
          `Invalid status "${filters.status}". Expected one of: ${Object.values(HangoutStatus).join(', ')}`,
        );
      }
      query.status = filters.status;
    } else if (!includePast) {
      query.status = {
        $in: [HangoutStatus.UPCOMING, HangoutStatus.ONGOING],
      };
    }

    return query;
  }

  private async executeHangoutQuery(
    query: Record<string, any>,
    userId?: string,
    sort: 1 | -1 = 1,
  ) {
    const hangouts = await this.hangoutModel
      .find(query)
      .populate('createdBy', 'name email')
      .populate('blastedBy', 'name email')
      .populate('requestedBy', 'name email')
      .sort({ time: sort })
      .exec();

    // Add user status fields for authenticated users
    if (!userId) {
      return hangouts;
    }

    return hangouts.map((hangout) => {
      const hangoutObj = hangout.toObject();
      const userHasBlasted = this.collectionIncludesUser(
        hangout.blastedBy,
        userId,
      );
      const userHasRequested = this.collectionIncludesUser(
        hangout.requestedBy,
        userId,
      );
      const userIsAttending = this.collectionIncludesUser(
        hangout.attendees,
        userId,
      );
      return {
        ...hangoutObj,
        userHasBlasted,
        userHasRequested,
        userIsAttending,
        userHasJoined: userIsAttending,
      };
    });
  }

  // Entries are populated User docs in some queries and raw ObjectIds in others,
  // so membership has to handle both shapes.
  private collectionIncludesUser(
    collection: any[] | undefined,
    userId: string,
  ): boolean {
    if (!Array.isArray(collection)) {
      return false;
    }

    return collection.some((entry) => {
      if (!entry) return false;
      if (typeof entry === 'string') return entry === userId;
      if (entry._id) return entry._id.toString() === userId;
      return entry.toString() === userId;
    });
  }

  // Default feed hides finished events and puts the soonest hangout first.
  // includePast=true adds history back, newest first.
  //
  // "Near me": lat/lng (+ radiusKm, default 10) keeps hangouts whose meeting point is
  // inside the circle and adds `distanceKm` to each; sort=distance puts the closest first.
  async findAll(filters?: HangoutFeedFilters, userId?: string) {
    const includePast =
      filters?.includePast === true || filters?.includePast === 'true';
    const near = parseNear(filters ?? {});
    if (filters?.sort && !['time', 'distance'].includes(filters.sort)) {
      throw new BadRequestException('sort must be "time" or "distance"');
    }
    if (filters?.sort === 'distance' && !near) {
      throw new BadRequestException('sort=distance needs lat and lng');
    }

    const query = this.buildFeedQuery(filters, { includePrivate: false }, near);
    const hangouts = await this.executeHangoutQuery(
      query,
      userId,
      includePast ? -1 : 1,
    );
    if (!near) return hangouts;

    type FeedItem = Record<string, unknown> & {
      geo?: { coordinates?: number[] };
    };
    const withDistance = hangouts.map((hangout) => {
      const plain = (
        hangout instanceof this.hangoutModel ? hangout.toObject() : hangout
      ) as FeedItem;
      const [lng, lat] = plain.geo?.coordinates ?? [];
      const km =
        lat == null
          ? undefined
          : Math.round(distanceKm(near, { lat, lng }) * 10) / 10;
      return { ...plain, distanceKm: km };
    });

    // Array.sort is stable, so equal distances keep the soonest-first order
    return filters?.sort === 'distance'
      ? withDistance.sort(
          (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
        )
      : withDistance;
  }

  // Most used tags on hangouts people can still join, for the home page filter chips
  async getPopularTags(limit = 15): Promise<{ tag: string; count: number }[]> {
    return this.hangoutModel.aggregate([
      {
        $match: {
          isPublic: true,
          status: { $in: [HangoutStatus.UPCOMING, HangoutStatus.ONGOING] },
          'tags.0': { $exists: true },
        },
      },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: limit },
      { $project: { _id: 0, tag: '$_id', count: 1 } },
    ]);
  }

  async findAllAdmin(
    filters?: {
      purpose?: string;
      place?: string;
      date?: string;
      status?: string;
      includePast?: boolean | string;
    },
    userId?: string,
  ) {
    const query = this.buildFeedQuery(filters, { includePrivate: true });

    // Admins manage everything, including events that already finished.
    return this.executeHangoutQuery(query, userId, -1);
  }

  async findOne(id: string, userId?: string) {
    const hangout = await this.hangoutModel
      .findById(id)
      .populate('createdBy', 'name email')
      .populate('attendees', 'name email')
      .populate('blastedBy', 'name email')
      .populate('requestedBy', 'name email')
      .exec();

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    // Get join requests for this hangout (legacy support)
    const joinRequests = await this.joinRequestModel
      .find({ hangoutId: id })
      .populate('userId', 'name email')
      .exec();

    const hangoutObj = hangout.toObject();

    // Check if current user has blasted this hangout
    let userHasBlasted = false;
    let userHasRequested = false;
    let userIsAttending = false;

    if (userId) {
      userHasBlasted = this.collectionIncludesUser(hangout.blastedBy, userId);
      userHasRequested = this.collectionIncludesUser(
        hangout.requestedBy,
        userId,
      );
      userIsAttending = this.collectionIncludesUser(hangout.attendees, userId);
    }

    return {
      ...hangoutObj,
      joinRequests, // Legacy support
      userHasBlasted,
      userHasRequested,
      userIsAttending,
      userHasJoined: userIsAttending,
    };
  }

  async update(
    id: string,
    updateHangoutDto: UpdateHangoutDto,
    userId: string,
    isAdmin: boolean = false,
  ) {
    const hangout = await this.hangoutModel.findById(id);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    // Admins can update any hangout, regular users can only update their own
    if (!isAdmin && hangout.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only update your own hangouts');
    }

    const updateData: any = { ...updateHangoutDto };
    if (updateHangoutDto.time) {
      const start = new Date(updateHangoutDto.time);
      if (isNaN(start.getTime())) {
        throw new BadRequestException('Hangout time is not a valid date');
      }
      if (start.getTime() < Date.now() - MINUTE) {
        throw new BadRequestException('Hangout time must be in the future');
      }
      updateData.time = start;
      // A new start time means the old reminder plan is stale
      updateData.remindersSent = [];
    }
    if (updateHangoutDto.durationMinutes) {
      updateData.durationMinutes = updateHangoutDto.durationMinutes;
    }

    // Re-derive the lifecycle state from the (possibly new) time, unless the
    // organizer cancelled it — cancellation is never undone implicitly.
    updateData.status = deriveHangoutStatus(
      updateData.time ?? hangout.time,
      updateData.durationMinutes ?? hangout.durationMinutes,
      hangout.status,
    );

    if (
      updateData.status !== hangout.status &&
      updateData.status !== HangoutStatus.CANCELLED
    ) {
      updateData.$unset = {
        ...(updateData.$unset ?? {}),
        cancelledAt: 1,
        cancelReason: 1,
      };
    }

    if (updateHangoutDto.location === null) {
      // Remove the map location
      delete updateData.location;
      updateData.$unset = { ...(updateData.$unset ?? {}), location: 1, geo: 1 };
    } else if (updateHangoutDto.location) {
      // Keep the "near me" point in step with the new location
      const geo = geoFromLocation(updateHangoutDto.location as HangoutLocation);
      if (geo) {
        updateData.geo = geo;
      } else {
        updateData.$unset = { ...(updateData.$unset ?? {}), geo: 1 };
      }
    }

    if (updateHangoutDto.tags) {
      updateData.tags = normalizeTags(updateHangoutDto.tags);
    }

    await this.hangoutModel.findByIdAndUpdate(id, updateData);
    return this.findOne(id);
  }

  async remove(id: string, userId: string, isAdmin: boolean = false) {
    const hangout = await this.hangoutModel.findById(id);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    // Admins can delete any hangout, regular users can only delete their own
    if (!isAdmin && hangout.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own hangouts');
    }

    await this.hangoutModel.findByIdAndDelete(id);
    await this.joinRequestModel.deleteMany({ hangoutId: id });
    return { message: 'Hangout deleted successfully' };
  }

  async requestToJoin(hangoutId: string, userId: string) {
    const hangout = await this.hangoutModel.findById(hangoutId);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    if (hangout.status === HangoutStatus.CANCELLED) {
      throw new BadRequestException('This hangout was cancelled');
    }

    if (hangout.status === HangoutStatus.COMPLETED) {
      throw new BadRequestException('This hangout has already finished');
    }

    // Check if user is already an attendee
    if (hangout.attendees.includes(userId as any)) {
      throw new BadRequestException('You are already attending this hangout');
    }

    // Check if user already has a pending request
    if (hangout.requestedBy.includes(userId as any)) {
      throw new BadRequestException(
        'You already have a pending request for this hangout',
      );
    }

    // Check if hangout is full
    if (hangout.attendees.length >= hangout.capacity) {
      throw new BadRequestException('This hangout is full');
    }

    // Add user to requestedBy array
    hangout.requestedBy.push(userId as any);
    await hangout.save();
    this.alertJoinRequest(hangout, userId);

    return {
      message: 'Join request sent successfully',
      hangoutId,
      userId,
      status: 'pending',
    };
  }

  async handleJoinRequest(
    requestId: string,
    status: JoinRequestStatus,
    userId: string,
    isAdmin: boolean = false,
  ) {
    const joinRequest = await this.joinRequestModel
      .findById(requestId)
      .populate('hangoutId')
      .exec();

    if (!joinRequest) {
      throw new NotFoundException('Join request not found');
    }

    const hangout = await this.hangoutModel.findById(joinRequest.hangoutId);
    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    // Admins can handle any join request, regular users can only handle requests for their own hangouts
    if (!isAdmin && hangout.createdBy.toString() !== userId) {
      throw new ForbiddenException(
        'You can only handle requests for your own hangouts',
      );
    }

    joinRequest.status = status;
    await joinRequest.save();

    // If approved, add user to attendees
    if (status === JoinRequestStatus.APPROVED) {
      const currentStatus = deriveHangoutStatus(
        hangout.time,
        hangout.durationMinutes,
        hangout.status,
      );
      if (currentStatus === HangoutStatus.CANCELLED) {
        throw new BadRequestException('This hangout was cancelled');
      }
      if (currentStatus === HangoutStatus.COMPLETED) {
        throw new BadRequestException('This hangout has already finished');
      }

      if (!hangout.attendees.includes(joinRequest.userId)) {
        hangout.attendees.push(joinRequest.userId);
        await hangout.save();
      }
    }

    if (
      status === JoinRequestStatus.APPROVED ||
      status === JoinRequestStatus.REJECTED
    ) {
      this.alertJoinDecision(
        hangout,
        joinRequest.userId.toString(),
        status === JoinRequestStatus.APPROVED,
        userId,
      );
    }

    return joinRequest;
  }

  async handleJoinRequestNew(
    hangoutId: string,
    requestedUserId: string,
    action: 'approve' | 'reject',
    currentUserId: string,
    isAdmin: boolean = false,
  ) {
    const hangout = await this.hangoutModel.findById(hangoutId);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    // Admins can handle any join request, regular users can only handle requests for their own hangouts
    if (!isAdmin && hangout.createdBy.toString() !== currentUserId) {
      throw new ForbiddenException(
        'You can only handle requests for your own hangouts',
      );
    }

    // Check if user actually has a pending request
    if (!hangout.requestedBy.includes(requestedUserId as any)) {
      throw new BadRequestException('No pending request found for this user');
    }

    // Remove user from requestedBy array
    hangout.requestedBy = hangout.requestedBy.filter(
      (id) => id.toString() !== requestedUserId,
    );

    if (action === 'approve') {
      // Re-derive from the clock so stale "upcoming" rows cannot slip through
      const currentStatus = deriveHangoutStatus(
        hangout.time,
        hangout.durationMinutes,
        hangout.status,
      );
      if (currentStatus === HangoutStatus.CANCELLED) {
        throw new BadRequestException('This hangout was cancelled');
      }
      if (currentStatus === HangoutStatus.COMPLETED) {
        throw new BadRequestException('This hangout has already finished');
      }

      // Check if hangout is full
      if (hangout.attendees.length >= hangout.capacity) {
        throw new BadRequestException('This hangout is full');
      }

      // Add user to attendees if not already there
      if (!hangout.attendees.includes(requestedUserId as any)) {
        hangout.attendees.push(requestedUserId as any);
      }
    }

    await hangout.save();
    this.alertJoinDecision(
      hangout,
      requestedUserId,
      action === 'approve',
      currentUserId,
    );

    return {
      message: `Join request ${action}d successfully`,
      hangoutId,
      requestedUserId,
      action,
      status: action === 'approve' ? 'approved' : 'rejected',
    };
  }

  async toggleBlast(hangoutId: string, userId: string) {
    const hangout = await this.hangoutModel.findById(hangoutId);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    const userObjectId = userId as any;
    const hasBlasted = hangout.blastedBy.includes(userObjectId);

    if (hasBlasted) {
      // Remove blast (downvote)
      hangout.blastedBy = hangout.blastedBy.filter(
        (id) => id.toString() !== userId,
      );
      hangout.blasts = Math.max(0, hangout.blasts - 1);
    } else {
      // Add blast (upvote)
      hangout.blastedBy.push(userObjectId);
      hangout.blasts += 1;
    }

    await hangout.save();

    return {
      hangoutId,
      blasts: hangout.blasts,
      userBlasted: !hasBlasted,
      action: hasBlasted ? 'removed' : 'added',
    };
  }

  async getMyHangouts(userId: string) {
    return this.hangoutModel
      .find({ createdBy: userId })
      .populate('createdBy', 'name email')
      .populate('attendees', 'name email')
      .populate('requestedBy', 'name email role verified')
      .sort({ createdAt: -1 })
      .exec();
  }

  async getMyHangoutsWithRequests(userId: string) {
    const hangouts = await this.hangoutModel
      .find({ createdBy: userId })
      .populate('createdBy', 'name email')
      .populate('attendees', 'name email role verified')
      .populate('requestedBy', 'name email role verified')
      .sort({ createdAt: -1 })
      .exec();

    // Transform data to include detailed request information
    return hangouts.map((hangout) => {
      const hangoutObj = hangout.toObject();
      return {
        ...hangoutObj,
        stats: {
          totalAttendees: hangout.attendees.length,
          pendingRequests: hangout.requestedBy.length,
          availableSpots: hangout.capacity - hangout.attendees.length,
          isFull: hangout.attendees.length >= hangout.capacity,
        },
        requestDetails: hangout.requestedBy.map((user: any) => ({
          userId: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          verified: user.verified,
          requestedAt: new Date(), // Could be enhanced with actual request timestamps
        })),
        attendeeDetails: hangout.attendees.map((user: any) => ({
          userId: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          verified: user.verified,
        })),
      };
    });
  }

  async getHangoutsByUser(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.hangoutModel
      .find({ createdBy: userId })
      .populate('createdBy', 'name email')
      .populate('attendees', 'name email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async leaveHangout(hangoutId: string, userId: string) {
    const hangout = await this.hangoutModel.findById(hangoutId);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    // Check if user is actually in the hangout
    const isAttendee = hangout.attendees.some(
      (attendeeId) => attendeeId.toString() === userId,
    );

    if (!isAttendee) {
      throw new BadRequestException('You are not an attendee of this hangout');
    }

    // Remove user from attendees array
    hangout.attendees = hangout.attendees.filter(
      (attendeeId) => attendeeId.toString() !== userId,
    );

    // Update any approved join request to "rejected" or remove it
    await this.joinRequestModel.deleteMany({
      hangoutId,
      userId,
    });

    await hangout.save();

    return {
      message: 'Successfully left the hangout',
      hangoutId,
      hangoutTitle: hangout.title,
      remainingAttendees: hangout.attendees.length,
    };
  }

  async cancelJoinRequest(hangoutId: string, userId: string) {
    const hangout = await this.hangoutModel.findById(hangoutId);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    // Check if user has a pending request
    const hasRequest = hangout.requestedBy.some(
      (requesterId) => requesterId.toString() === userId,
    );

    if (!hasRequest) {
      throw new BadRequestException(
        'You do not have a pending request for this hangout',
      );
    }

    // Remove user from requestedBy array
    hangout.requestedBy = hangout.requestedBy.filter(
      (requesterId) => requesterId.toString() !== userId,
    );

    await hangout.save();

    return {
      message: 'Successfully cancelled join request',
      hangoutId,
      hangoutTitle: hangout.title,
      userId,
      action: 'cancelled',
    };
  }

  async leaveOrCancelHangout(hangoutId: string, userId: string) {
    const hangout = await this.hangoutModel.findById(hangoutId);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    const isAttendee = hangout.attendees.some(
      (attendeeId) => attendeeId.toString() === userId,
    );
    const hasRequest = hangout.requestedBy.some(
      (requesterId) => requesterId.toString() === userId,
    );

    if (!isAttendee && !hasRequest) {
      throw new BadRequestException('You are not associated with this hangout');
    }

    let action = '';
    let message = '';

    // If user is an attendee, remove from attendees
    if (isAttendee) {
      hangout.attendees = hangout.attendees.filter(
        (attendeeId) => attendeeId.toString() !== userId,
      );
      action = 'left';
      message = 'Successfully left the hangout';

      // Also remove any legacy join requests
      await this.joinRequestModel.deleteMany({
        hangoutId,
        userId,
      });
    }

    // If user has a pending request, remove from requestedBy
    if (hasRequest) {
      hangout.requestedBy = hangout.requestedBy.filter(
        (requesterId) => requesterId.toString() !== userId,
      );
      action = isAttendee ? 'left_and_cancelled' : 'cancelled_request';
      message = isAttendee
        ? 'Successfully left the hangout and cancelled any pending requests'
        : 'Successfully cancelled join request';
    }

    await hangout.save();

    return {
      message,
      hangoutId,
      hangoutTitle: hangout.title,
      userId,
      action,
      remainingAttendees: hangout.attendees.length,
      pendingRequests: hangout.requestedBy.length,
    };
  }

  async getJoinedHangouts(userId: string) {
    return this.hangoutModel
      .find({
        attendees: userId,
        createdBy: { $ne: userId }, // Exclude hangouts created by the user
      })
      .populate('createdBy', 'name email')
      .populate('attendees', 'name email')
      .sort({ time: 1 }) // Sort by upcoming events first
      .exec();
  }

  async getRequestedHangouts(userId: string) {
    return this.hangoutModel
      .find({
        requestedBy: userId, // Hangouts where user has pending requests
        createdBy: { $ne: userId }, // Exclude hangouts created by the user
      })
      .populate('createdBy', 'name email')
      .populate('attendees', 'name email')
      .populate('requestedBy', 'name email')
      .sort({ createdAt: -1 }) // Sort by most recent requests first
      .exec();
  }

  async getMyHangoutRequests(userId: string) {
    // Get hangouts created by the user that have pending requests
    const hangouts = await this.hangoutModel
      .find({
        createdBy: userId,
        requestedBy: { $exists: true, $not: { $size: 0 } }, // Only hangouts with pending requests
      })
      .populate('createdBy', 'name email')
      .populate('attendees', 'name email')
      .populate('requestedBy', 'name email role verified') // Include more user details
      .sort({ createdAt: -1 })
      .exec();

    // Transform the data to show request details more clearly
    return hangouts.map((hangout) => {
      const hangoutObj = hangout.toObject();
      return {
        ...hangoutObj,
        pendingRequestsCount: hangout.requestedBy.length,
        requestDetails: hangout.requestedBy.map((user: any) => ({
          userId: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          verified: user.verified,
          requestedAt: new Date(), // Placeholder - could be enhanced with actual request timestamps
        })),
      };
    });
  }

  async getMyRequestsCount(userId: string) {
    const result = await this.hangoutModel.aggregate([
      {
        $match: {
          createdBy: userId as any,
          requestedBy: { $exists: true, $not: { $size: 0 } },
        },
      },
      {
        $project: {
          hangoutTitle: '$title',
          requestCount: { $size: '$requestedBy' },
        },
      },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: '$requestCount' },
          hangoutsWithRequests: { $sum: 1 },
          details: {
            $push: {
              hangoutId: '$_id',
              hangoutTitle: '$hangoutTitle',
              requestCount: '$requestCount',
            },
          },
        },
      },
    ]);

    return (
      result[0] || {
        totalRequests: 0,
        hangoutsWithRequests: 0,
        details: [],
      }
    );
  }

  // ---- Lifecycle & reminders (driven by HangoutsScheduler) ----

  // Documents created before the status field existed have none. Derive it once
  // at boot so the default feed (which filters on status) does not hide them.
  async backfillLegacyStatuses() {
    const legacy = await this.hangoutModel
      .find({
        $or: [
          { status: { $exists: false } },
          { status: null },
          { remindersSent: { $exists: false } },
        ],
      })
      .select('time durationMinutes status')
      .lean()
      .exec();

    if (!legacy.length) return { updated: 0 };

    await this.hangoutModel.bulkWrite(
      legacy.map((hangout) => ({
        updateOne: {
          filter: { _id: hangout._id },
          update: {
            $set: {
              status:
                hangout.status ??
                deriveHangoutStatus(hangout.time, hangout.durationMinutes),
              remindersSent: [],
            },
          },
        },
      })),
    );

    this.logger.log(
      `Backfilled lifecycle status for ${legacy.length} hangout(s)`,
    );
    return { updated: legacy.length };
  }

  // Hangouts saved before "near me" existed have a map location but no `geo` point.
  // Fill it in once at boot so they show up in nearby searches.
  async backfillGeoPoints() {
    const missing = await this.hangoutModel
      .find({ location: { $exists: true }, geo: { $exists: false } })
      .select('location')
      .lean()
      .exec();

    const updates = missing
      .map((hangout) => ({
        _id: hangout._id,
        geo: geoFromLocation(hangout.location),
      }))
      .filter((entry) => entry.geo);
    if (!updates.length) return { updated: 0 };

    await this.hangoutModel.bulkWrite(
      updates.map(({ _id, geo }) => ({
        updateOne: { filter: { _id }, update: { $set: { geo } } },
      })),
    );

    this.logger.log(`Backfilled map points for ${updates.length} hangout(s)`);
    return { updated: updates.length };
  }

  // Sends one alert per reminder window that has just come due, to every
  // attendee. Each window is claimed atomically so it can never fire twice.
  async sendDueReminders(now: Date = new Date()) {
    const nowMs = now.getTime();
    let recipients = 0;
    let hangoutsNotified = 0;

    for (const window of REMINDER_WINDOWS) {
      const lower = new Date(nowMs + window.offsetMs - REMINDER_TOLERANCE_MS);
      const upper = new Date(nowMs + window.offsetMs + REMINDER_TOLERANCE_MS);

      const candidates = await this.hangoutModel
        .find({
          status: HangoutStatus.UPCOMING,
          time: { $gte: lower, $lt: upper },
          attendees: { $exists: true, $ne: [] },
        })
        .select('_id')
        .lean()
        .exec();

      for (const candidate of candidates) {
        const claimed = await this.hangoutModel
          .findOneAndUpdate(
            { _id: candidate._id, remindersSent: { $ne: window.kind } },
            { $addToSet: { remindersSent: window.kind } },
            { new: true },
          )
          .select('_id title place time attendees')
          .lean()
          .exec();

        if (!claimed) continue;

        const detail = [
          claimed.title,
          formatHangoutWhen(claimed.time),
          claimed.place,
        ]
          .filter(Boolean)
          .join(' · ');

        for (const attendee of claimed.attendees) {
          await this.notifications.notify(attendee.toString(), {
            type: NotificationType.HANGOUT_REMINDER,
            hangoutId: String(claimed._id),
            title: window.headline,
            body: detail,
            link: `/hangouts/details/${claimed._id}`,
          });
          recipients += 1;
        }

        hangoutsNotified += 1;
      }
    }

    if (recipients) {
      this.logger.log(
        `Sent ${recipients} reminder(s) across ${hangoutsNotified} hangout(s)`,
      );
    }

    return { hangoutsNotified, recipients };
  }

  // Moves hangouts from upcoming → ongoing → completed based on the clock.
  // Cancelled hangouts are terminal and are never touched.
  async syncStatuses(now: Date = new Date()) {
    const nowMs = now.getTime();

    const due = await this.hangoutModel
      .find({
        status: { $in: [HangoutStatus.UPCOMING, HangoutStatus.ONGOING] },
        time: { $lte: now },
      })
      .select('_id title place time durationMinutes attendees status')
      .lean()
      .exec();

    if (!due.length) return { started: 0, completed: 0 };

    const operations: any[] = [];
    const justStarted: typeof due = [];

    for (const hangout of due) {
      const next = deriveHangoutStatus(
        hangout.time,
        hangout.durationMinutes,
        hangout.status,
        nowMs,
      );

      if (next === hangout.status) continue;

      if (next === HangoutStatus.ONGOING) {
        operations.push({
          updateOne: {
            filter: { _id: hangout._id },
            update: { $set: { status: HangoutStatus.ONGOING } },
          },
        });

        // Only announce events that genuinely just began, otherwise a server
        // that was down for a week greets everyone with old "starting now" alerts.
        if (
          nowMs - new Date(hangout.time).getTime() <=
          JUST_STARTED_WINDOW_MS
        ) {
          justStarted.push(hangout);
        }
      }

      if (next === HangoutStatus.COMPLETED) {
        operations.push({
          updateOne: {
            filter: { _id: hangout._id },
            update: {
              $set: { status: HangoutStatus.COMPLETED, completedAt: now },
            },
          },
        });
      }
    }

    if (operations.length) {
      await this.hangoutModel.bulkWrite(operations);
    }

    for (const hangout of justStarted) {
      const detail = [
        hangout.title,
        formatHangoutWhen(hangout.time),
        hangout.place,
      ]
        .filter(Boolean)
        .join(' · ');

      for (const attendee of hangout.attendees ?? []) {
        await this.notifications.notify(attendee.toString(), {
          type: NotificationType.HANGOUT_STARTED,
          hangoutId: String(hangout._id),
          title: 'Happening now',
          body: detail,
          link: `/hangouts/details/${hangout._id}`,
        });
      }
    }

    if (operations.length) {
      this.logger.log(
        `Lifecycle: ${justStarted.length} started, ${operations.length - justStarted.length} completed`,
      );
    }

    return {
      started: justStarted.length,
      completed: operations.length - justStarted.length,
    };
  }

  private alertCancelled(hangout: Hangout, cancelledById: string) {
    const reason = hangout.cancelReason ? ` — ${hangout.cancelReason}` : '';

    for (const attendee of hangout.attendees) {
      this.notifications.notify(attendee.toString(), {
        type: NotificationType.HANGOUT_CANCELLED,
        actorId: cancelledById,
        hangoutId: String(hangout._id),
        title: 'Hangout cancelled',
        body: `${hangout.title}${reason}`,
        link: `/hangouts/details/${hangout._id}`,
      });
    }
  }

  // Manual lifecycle control. Only `cancelled` is a real user decision —
  // everything else is re-derived from the start time so the clock stays honest.
  async setStatus(
    id: string,
    dto: UpdateHangoutStatusDto,
    userId: string,
    isAdmin = false,
  ) {
    const hangout = await this.hangoutModel.findById(id);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    if (!isAdmin && hangout.createdBy.toString() !== userId) {
      throw new ForbiddenException(
        'You can only change the status of your own hangouts',
      );
    }

    const hangoutId = String(hangout._id);

    if (dto.status === HangoutStatus.CANCELLED) {
      if (hangout.status === HangoutStatus.CANCELLED) {
        throw new BadRequestException('This hangout is already cancelled');
      }
      if (hangout.status === HangoutStatus.COMPLETED) {
        throw new BadRequestException('This hangout has already finished');
      }

      const cancelReason = dto.reason?.trim();

      await this.hangoutModel.updateOne(
        { _id: hangout._id },
        {
          $set: {
            status: HangoutStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelReason: cancelReason || undefined,
          },
        },
      );

      // Clear the live doc so the alert carries the reason
      hangout.status = HangoutStatus.CANCELLED;
      hangout.cancelReason = cancelReason || undefined;
      this.alertCancelled(hangout, userId);

      return this.findOne(hangoutId);
    }

    if (dto.status === HangoutStatus.COMPLETED) {
      if (hangout.status === HangoutStatus.CANCELLED) {
        throw new BadRequestException(
          'A cancelled hangout cannot be completed',
        );
      }

      await this.hangoutModel.updateOne(
        { _id: hangout._id },
        {
          $set: { status: HangoutStatus.COMPLETED, completedAt: new Date() },
        },
      );

      return this.findOne(hangoutId);
    }

    // Restoring a cancelled hangout: trust the clock, not the old status.
    const restored = deriveHangoutStatus(hangout.time, hangout.durationMinutes);

    await this.hangoutModel.updateOne(
      { _id: hangout._id },
      {
        $set: {
          status: restored,
          // A revived hangout needs a fresh reminder plan
          remindersSent: [],
        },
        $unset: { cancelledAt: 1, cancelReason: 1, completedAt: 1 },
      },
    );

    return this.findOne(hangoutId);
  }

  // Headline counts for the discovery filters and the "your next hangout" nudge.
  async getStatusCounts(userId?: string) {
    const grouped = await this.hangoutModel
      .aggregate([
        { $match: { isPublic: true } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .exec();

    const counts: Record<string, number> = {};
    for (const row of grouped) {
      if (row._id) counts[row._id] = row.count;
    }

    let mine: { upcoming: number; live: number } | undefined;

    if (userId) {
      const [upcoming, live] = await Promise.all([
        this.hangoutModel.countDocuments({
          status: HangoutStatus.UPCOMING,
          $or: [{ attendees: userId }, { createdBy: userId }],
        }),
        this.hangoutModel.countDocuments({
          status: HangoutStatus.ONGOING,
          $or: [{ attendees: userId }, { createdBy: userId }],
        }),
      ]);
      mine = { upcoming, live };
    }

    return {
      upcoming: counts[HangoutStatus.UPCOMING] ?? 0,
      ongoing: counts[HangoutStatus.ONGOING] ?? 0,
      completed: counts[HangoutStatus.COMPLETED] ?? 0,
      cancelled: counts[HangoutStatus.CANCELLED] ?? 0,
      mine,
    };
  }

  async getStats() {
    const totalHangouts = await this.hangoutModel.countDocuments();
    const publicHangouts = await this.hangoutModel.countDocuments({
      isPublic: true,
    });
    const privateHangouts = await this.hangoutModel.countDocuments({
      isPublic: false,
    });
    const sponsoredHangouts = await this.hangoutModel.countDocuments({
      sponsored: true,
    });
    const totalUsers = await this.userModel.countDocuments();
    const totalJoinRequests = await this.joinRequestModel.countDocuments();
    const byStatus = await this.hangoutModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const statusCounts = Object.values(HangoutStatus).reduce<
      Record<string, number>
    >((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {});
    for (const row of byStatus) {
      if (row._id) statusCounts[row._id] = row.count;
    }

    return {
      hangouts: {
        total: totalHangouts,
        public: publicHangouts,
        private: privateHangouts,
        sponsored: sponsoredHangouts,
        byStatus: statusCounts,
      },
      users: {
        total: totalUsers,
      },
      joinRequests: {
        total: totalJoinRequests,
      },
    };
  }
}
