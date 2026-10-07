import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../auth/schemas/user.schema';
import { escapeRegex } from '../hangouts/hangout-search';
import { Hangout, HangoutStatus } from '../hangouts/schemas/hangout.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { ActivityService } from './activity.service';
import { Activity, ActivityVerb } from './schemas/activity.schema';
import { Follow } from './schemas/follow.schema';

const PAGE_SIZE = 20;
const LIST_PAGE_SIZE = 30;
const PROFILE_HANGOUTS = 12;
const SUGGESTIONS = 8;
const ACTIVE = [HangoutStatus.UPCOMING, HangoutStatus.ONGOING];
const HANGOUT_CARD_FIELDS =
  'title time place purpose status isPublic capacity attendees createdBy location tags';

export interface PersonSummary {
  _id: string;
  name: string;
  isFollowing?: boolean; // the viewer follows them
  followsYou?: boolean; // they follow the viewer
}

// Hangout ids are stored as strings in some documents and ObjectIds in others; match both
function idMatch(id: string) {
  return Types.ObjectId.isValid(id)
    ? { $in: [id, new Types.ObjectId(id)] }
    : id;
}

function oid(id: string, what = 'user'): Types.ObjectId {
  if (!Types.ObjectId.isValid(id))
    throw new NotFoundException(`${what} not found`);
  return new Types.ObjectId(id);
}

function parseBefore(before?: string): Date | undefined {
  if (!before) return undefined;
  const date = new Date(before);
  if (isNaN(date.getTime()))
    throw new BadRequestException('before is not a valid date');
  return date;
}

@Injectable()
export class SocialService {
  constructor(
    @InjectModel(Follow.name) private followModel: Model<Follow>,
    @InjectModel(Activity.name) private activityModel: Model<Activity>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Hangout.name) private hangoutModel: Model<Hangout>,
    private activity: ActivityService,
    private notifications: NotificationsService,
  ) {}

  // ---- Following ----

  async follow(userId: string, targetId: string) {
    if (userId === targetId)
      throw new BadRequestException("You can't follow yourself");
    const target = await this.userModel
      .findById(oid(targetId))
      .select('name')
      .lean();
    if (!target) throw new NotFoundException('User not found');

    const result = await this.followModel.updateOne(
      { follower: oid(userId), following: oid(targetId) },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true, timestamps: false },
    );

    // Only a new follow is news (following twice changes nothing)
    if (result.upsertedCount) {
      const me = await this.userModel
        .findById(oid(userId))
        .select('name')
        .lean();
      void this.notifications.notify(targetId, {
        type: NotificationType.NEW_FOLLOWER,
        actorId: userId,
        title: 'New follower',
        body: `${me?.name ?? 'Someone'} started following you`,
        link: `/people/${userId}`,
      });
      void this.activity.record(userId, ActivityVerb.FOLLOWED, {
        targetUserId: targetId,
      });
    }
    return this.relationship(userId, targetId);
  }

  async unfollow(userId: string, targetId: string) {
    await this.followModel.deleteOne({
      follower: oid(userId),
      following: oid(targetId),
    });
    void this.activity.remove(userId, ActivityVerb.FOLLOWED, {
      targetUserId: targetId,
    });
    return this.relationship(userId, targetId);
  }

  // Ids of everyone the user follows (used for the feed and "friends going")
  async followingIds(userId: string): Promise<Set<string>> {
    if (!Types.ObjectId.isValid(userId)) return new Set();
    const rows = await this.followModel
      .find({ follower: new Types.ObjectId(userId) })
      .select('following')
      .lean();
    return new Set(rows.map((row) => String(row.following)));
  }

  async relationshipWith(viewerId: string, otherId: string) {
    if (viewerId === otherId) {
      return { isFollowing: false, followsYou: false, followers: 0 };
    }
    return this.relationship(viewerId, otherId);
  }

  private async relationship(viewerId: string, otherId: string) {
    const [isFollowing, followsYou, followers] = await Promise.all([
      this.followModel.exists({
        follower: oid(viewerId),
        following: oid(otherId),
      }),
      this.followModel.exists({
        follower: oid(otherId),
        following: oid(viewerId),
      }),
      this.followModel.countDocuments({ following: oid(otherId) }),
    ]);
    return { isFollowing: !!isFollowing, followsYou: !!followsYou, followers };
  }

  // Mark each person with how they relate to the viewer, in two queries
  private async withRelationships(
    viewerId: string | undefined,
    people: { _id: unknown; name: string }[],
  ): Promise<PersonSummary[]> {
    const ids = people.map((p) => String(p._id));
    let following = new Set<string>();
    let followers = new Set<string>();
    if (viewerId && Types.ObjectId.isValid(viewerId) && ids.length) {
      const objectIds = ids.map((id) => new Types.ObjectId(id));
      const viewer = new Types.ObjectId(viewerId);
      const [out, inc] = await Promise.all([
        this.followModel
          .find({ follower: viewer, following: { $in: objectIds } })
          .select('following')
          .lean(),
        this.followModel
          .find({ following: viewer, follower: { $in: objectIds } })
          .select('follower')
          .lean(),
      ]);
      following = new Set(out.map((f) => String(f.following)));
      followers = new Set(inc.map((f) => String(f.follower)));
    }
    return people.map((p) => {
      const id = String(p._id);
      return viewerId
        ? {
            _id: id,
            name: p.name,
            isFollowing: following.has(id),
            followsYou: followers.has(id),
          }
        : { _id: id, name: p.name };
    });
  }

  // ---- People ----

  // Public profile: no email, and only public hangouts that are still on
  async profile(targetId: string, viewerId?: string) {
    const user = await this.userModel
      .findById(oid(targetId))
      .select('name role verified createdAt')
      .lean<{
        _id: Types.ObjectId;
        name: string;
        role: string;
        verified: boolean;
        createdAt?: Date;
      }>();
    if (!user) throw new NotFoundException('User not found');

    const target = oid(targetId);
    const visible = { isPublic: true, status: { $in: ACTIVE } };
    const [followers, following, hosting, going, rel] = await Promise.all([
      this.followModel.countDocuments({ following: target }),
      this.followModel.countDocuments({ follower: target }),
      this.hangoutModel
        .find({ ...visible, createdBy: idMatch(targetId) })
        .select(HANGOUT_CARD_FIELDS)
        .sort({ time: 1 })
        .limit(PROFILE_HANGOUTS)
        .lean(),
      this.hangoutModel
        .find({
          ...visible,
          attendees: idMatch(targetId),
          createdBy: { $nin: [targetId, target] },
        })
        .select(HANGOUT_CARD_FIELDS)
        .sort({ time: 1 })
        .limit(PROFILE_HANGOUTS)
        .lean(),
      viewerId && viewerId !== targetId
        ? this.relationship(viewerId, targetId)
        : null,
    ]);

    return {
      _id: String(user._id),
      name: user.name,
      role: user.role,
      verified: user.verified,
      memberSince: user.createdAt,
      isMe: viewerId === targetId,
      isFollowing: rel?.isFollowing ?? false,
      followsYou: rel?.followsYou ?? false,
      followers,
      following,
      hosting: hosting.map((h) => this.hangoutCard(h)),
      going: going.map((h) => this.hangoutCard(h)),
    };
  }

  async followers(targetId: string, viewerId?: string, before?: string) {
    return this.followList(
      { following: oid(targetId) },
      'follower',
      viewerId,
      before,
    );
  }

  async following(targetId: string, viewerId?: string, before?: string) {
    return this.followList(
      { follower: oid(targetId) },
      'following',
      viewerId,
      before,
    );
  }

  private async followList(
    filter: Record<string, unknown>,
    field: 'follower' | 'following',
    viewerId?: string,
    before?: string,
  ) {
    const date = parseBefore(before);
    const rows = await this.followModel
      .find(date ? { ...filter, createdAt: { $lt: date } } : filter)
      .sort({ createdAt: -1 })
      .limit(LIST_PAGE_SIZE + 1)
      .populate(field, 'name')
      .lean();
    const page = rows.slice(0, LIST_PAGE_SIZE);
    const people = page
      .map(
        (row) => row[field] as unknown as { _id: unknown; name: string } | null,
      )
      .filter((p): p is { _id: unknown; name: string } => !!p); // skip deleted accounts
    return {
      items: await this.withRelationships(viewerId, people),
      hasMore: rows.length > LIST_PAGE_SIZE,
      nextBefore: page.at(-1)?.createdAt ?? null,
    };
  }

  async search(viewerId: string, query: string) {
    const text = (query ?? '').trim();
    if (text.length < 2) return { items: [] };
    const people = await this.userModel
      .find({
        name: { $regex: escapeRegex(text.slice(0, 50)), $options: 'i' },
        _id: { $ne: oid(viewerId) },
      })
      .select('name')
      .sort({ name: 1 })
      .limit(20)
      .lean();
    return { items: await this.withRelationships(viewerId, people) };
  }

  // Who to follow: people who follow you back first, then people you've been at hangouts with
  async suggestions(viewerId: string) {
    const viewer = oid(viewerId);
    const following = await this.followingIds(viewerId);
    const skip = (id: string) => id === viewerId || following.has(id);

    const reasons = new Map<string, string>();
    const followers = await this.followModel
      .find({ following: viewer })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('follower')
      .lean();
    for (const f of followers) {
      const id = String(f.follower);
      if (!skip(id) && !reasons.has(id)) reasons.set(id, 'Follows you');
    }

    if (reasons.size < SUGGESTIONS) {
      const shared = await this.hangoutModel
        .find({
          $or: [
            { attendees: idMatch(viewerId) },
            { createdBy: idMatch(viewerId) },
          ],
        })
        .sort({ time: -1 })
        .limit(100)
        .select('attendees createdBy')
        .lean();
      const counts = new Map<string, number>();
      for (const h of shared) {
        for (const id of new Set(
          [...(h.attendees ?? []), h.createdBy].map(String),
        )) {
          if (!skip(id) && !reasons.has(id))
            counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
      [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, SUGGESTIONS - reasons.size)
        .forEach(([id, n]) =>
          reasons.set(
            id,
            n === 1
              ? 'Was at a hangout with you'
              : `Was at ${n} hangouts with you`,
          ),
        );
    }

    const ids = [...reasons.keys()]
      .filter((id) => Types.ObjectId.isValid(id))
      .slice(0, SUGGESTIONS);
    const users = await this.userModel
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .select('name')
      .lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const people = ids
      .map((id) => byId.get(id))
      .filter((u): u is NonNullable<typeof u> => !!u);
    const items = await this.withRelationships(viewerId, people);
    return { items: items.map((p) => ({ ...p, reason: reasons.get(p._id) })) };
  }

  // ---- Feed ----

  // What the people you follow are doing, newest first. "Going" rows for the same hangout on a
  // page are merged ("Asha and Bikash are going to …"). Hangouts the viewer can't see are skipped.
  async feed(viewerId: string, before?: string, limit = PAGE_SIZE) {
    const following = await this.followingIds(viewerId);
    if (!following.size)
      return { items: [], hasMore: false, nextBefore: null, followingCount: 0 };

    const date = parseBefore(before);
    const fetchSize = limit * 3 + 1; // headroom for rows that get filtered or merged
    const rows = await this.activityModel
      .find({
        actor: { $in: [...following].map((id) => new Types.ObjectId(id)) },
        ...(date ? { createdAt: { $lt: date } } : {}),
      })
      .sort({ createdAt: -1 })
      .limit(fetchSize)
      .lean();

    // Hydrate people and hangouts in two queries
    const userIds = new Set<string>();
    const hangoutIds = new Set<string>();
    rows.forEach((r) => {
      userIds.add(String(r.actor));
      if (r.targetUser) userIds.add(String(r.targetUser));
      if (r.hangoutId) hangoutIds.add(String(r.hangoutId));
    });
    const [users, hangouts] = await Promise.all([
      this.userModel
        .find({
          _id: { $in: [...userIds].map((id) => new Types.ObjectId(id)) },
        })
        .select('name')
        .lean(),
      this.hangoutModel
        .find({
          _id: { $in: [...hangoutIds].map((id) => new Types.ObjectId(id)) },
        })
        .select(HANGOUT_CARD_FIELDS)
        .lean(),
    ]);
    const userById = new Map(
      users.map((u) => [String(u._id), { _id: String(u._id), name: u.name }]),
    );
    const hangoutById = new Map(hangouts.map((h) => [String(h._id), h]));

    const canSee = (h: (typeof hangouts)[number]) =>
      h.isPublic ||
      String(h.createdBy) === viewerId ||
      (h.attendees ?? []).map(String).includes(viewerId);

    type Item = {
      id: string;
      verb: ActivityVerb;
      createdAt: Date;
      actors: { _id: string; name: string }[];
      hangout?: ReturnType<SocialService['hangoutCard']>;
      targetUser?: { _id: string; name: string; isMe: boolean };
    };
    const items: Item[] = [];
    const merged = new Map<string, Item>();
    let consumed = 0;
    let stoppedEarly = false;

    for (const row of rows) {
      const actor = userById.get(String(row.actor));
      const hangout = row.hangoutId
        ? hangoutById.get(String(row.hangoutId))
        : undefined;
      const target = row.targetUser
        ? userById.get(String(row.targetUser))
        : undefined;
      const visible =
        !!actor &&
        (row.verb === ActivityVerb.FOLLOWED
          ? !!target
          : !!hangout && canSee(hangout));

      if (visible) {
        const key =
          row.verb === ActivityVerb.GOING
            ? `going:${String(row.hangoutId)}`
            : null;
        const existing = key ? merged.get(key) : undefined;
        if (existing) {
          if (!existing.actors.some((a) => a._id === actor._id))
            existing.actors.push(actor);
        } else {
          if (items.length >= limit) {
            stoppedEarly = true;
            break;
          }
          const item: Item = {
            id: String(row._id),
            verb: row.verb,
            createdAt: row.createdAt!,
            actors: [actor],
            ...(hangout
              ? { hangout: this.hangoutCard(hangout, following, viewerId) }
              : {}),
            ...(target
              ? { targetUser: { ...target, isMe: target._id === viewerId } }
              : {}),
          };
          items.push(item);
          if (key) merged.set(key, item);
        }
      }
      consumed++;
    }

    const lastConsumed = rows[consumed - 1];
    return {
      items,
      hasMore: stoppedEarly || rows.length === fetchSize,
      nextBefore: lastConsumed?.createdAt ?? null,
      followingCount: following.size,
    };
  }

  // The small hangout summary used on profiles and in the feed
  private hangoutCard(
    h: {
      _id: unknown;
      title: string;
      time: Date;
      place: string;
      purpose: string;
      status: HangoutStatus;
      capacity: number;
      attendees?: unknown[];
      location?: unknown;
      tags?: string[];
    },
    following?: Set<string>,
    viewerId?: string,
  ) {
    const attendees = (h.attendees ?? []).map(String);
    return {
      _id: String(h._id),
      title: h.title,
      time: h.time,
      place: h.place,
      purpose: h.purpose,
      status: h.status,
      capacity: h.capacity,
      attendeesCount: attendees.length,
      location: h.location,
      tags: h.tags ?? [],
      ...(following
        ? {
            friendsGoingCount: attendees.filter(
              (id) => following.has(id) && id !== viewerId,
            ).length,
          }
        : {}),
    };
  }

  // For the hangout feed cards: who among the people you follow is going to each hangout
  async friendsGoing(
    viewerId: string,
    hangouts: { _id: unknown; attendees?: unknown[] }[],
    max = 3,
  ): Promise<
    Map<string, { people: { _id: string; name: string }[]; count: number }>
  > {
    const result = new Map<
      string,
      { people: { _id: string; name: string }[]; count: number }
    >();
    const following = await this.followingIds(viewerId);
    if (!following.size) return result;

    const perHangout = hangouts.map((h) => ({
      id: String(h._id),
      friends: [
        ...new Set(
          (h.attendees ?? [])
            .map((a) => String((a as { _id?: unknown })?._id ?? a))
            .filter((id) => following.has(id) && id !== viewerId),
        ),
      ],
    }));
    const needed = new Set(perHangout.flatMap((h) => h.friends.slice(0, max)));
    if (!needed.size) return result;

    const users = await this.userModel
      .find({ _id: { $in: [...needed].map((id) => new Types.ObjectId(id)) } })
      .select('name')
      .lean();
    const names = new Map(users.map((u) => [String(u._id), u.name]));
    for (const h of perHangout) {
      if (!h.friends.length) continue;
      result.set(h.id, {
        count: h.friends.length,
        people: h.friends
          .slice(0, max)
          .filter((id) => names.has(id))
          .map((id) => ({ _id: id, name: names.get(id)! })),
      });
    }
    return result;
  }
}
