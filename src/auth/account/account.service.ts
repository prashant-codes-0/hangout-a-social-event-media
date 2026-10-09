import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';

import { User } from '../schemas/user.schema';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { EmailService } from '../../common/services/email.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { UploadService } from '../../chat/upload.service';
import { RatingsService } from '../../hangouts/ratings.service';

import { Hangout } from '../../hangouts/schemas/hangout.schema';
import { JoinRequest } from '../../hangouts/schemas/join-request.schema';
import { HangoutTicket } from '../../hangouts/schemas/hangout-ticket.schema';
import { HangoutRating } from '../../hangouts/schemas/hangout-rating.schema';
import { HangoutCheckIn } from '../../hangouts/schemas/hangout-checkin.schema';
import { Message, MessageAttachment } from '../../chat/schemas/message.schema';
import { PrivateChat } from '../../chat/schemas/private-chat.schema';
import { PrivateMessage } from '../../chat/schemas/private-message.schema';
import { Notification } from '../../notifications/schemas/notification.schema';
import { PushSubscription } from '../../notifications/schemas/push-subscription.schema';
import { Follow } from '../../social/schemas/follow.schema';
import { Activity } from '../../social/schemas/activity.schema';

import { DeleteAccountDto } from '../dto/delete-account.dto';

/** How long a requested deletion can be undone before the account is purged. */
export const DELETION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A shared stand-in account. Content that others depend on (a hangout's
 * organizer, a group message's author) is re-pointed at this account on purge,
 * so conversations and events still render — as "Deleted user".
 */
export const DELETED_USER_EMAIL = 'deleted-user@hangout.local';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Hangout.name) private hangoutModel: Model<Hangout>,
    @InjectModel(JoinRequest.name) private joinRequestModel: Model<JoinRequest>,
    @InjectModel(HangoutTicket.name) private ticketModel: Model<HangoutTicket>,
    @InjectModel(HangoutRating.name) private ratingModel: Model<HangoutRating>,
    @InjectModel(HangoutCheckIn.name)
    private checkInModel: Model<HangoutCheckIn>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(PrivateChat.name) private privateChatModel: Model<PrivateChat>,
    @InjectModel(PrivateMessage.name)
    private privateMessageModel: Model<PrivateMessage>,
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
    @InjectModel(PushSubscription.name)
    private pushSubscriptionModel: Model<PushSubscription>,
    @InjectModel(Follow.name) private followModel: Model<Follow>,
    @InjectModel(Activity.name) private activityModel: Model<Activity>,
    private readonly twoFactorService: TwoFactorService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly uploadService: UploadService,
    private readonly ratingsService: RatingsService,
    private readonly realtime: RealtimeService,
  ) {}

  // ---- Deletion request (grace period) ----

  async requestDeletion(userId: string, dto: DeleteAccountDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.deletionScheduledFor) {
      return this.deletionScheduleResponse(user);
    }

    await this.reauthenticate(user, dto);

    const token = randomBytes(32).toString('hex');
    user.deletionRequestedAt = new Date();
    user.deletionScheduledFor = new Date(Date.now() + DELETION_GRACE_MS);
    user.deletionCancelToken = createHash('sha256').update(token).digest('hex');
    user.deletionCancelExpires = user.deletionScheduledFor;
    await user.save();

    const frontendUrl = this.configService
      .get<string>('FRONTEND_URL', 'http://localhost:4200')
      .replace(/\/+$/, '');
    const cancelUrl = `${frontendUrl}/auth/cancel-deletion?token=${token}`;

    await this.emailService.sendAccountDeletionScheduledEmail(
      user.email,
      user.name,
      cancelUrl,
      user.deletionScheduledFor,
    );

    // Sign the account out everywhere it is open right now.
    this.realtime.emitToUser(String(user._id), 'account:deletion-scheduled', {
      scheduledFor: user.deletionScheduledFor,
    });

    return this.deletionScheduleResponse(user);
  }

  private deletionScheduleResponse(user: User) {
    return {
      message:
        'Your account is scheduled for deletion. You have 7 days to change your mind from the link we emailed you.',
      scheduledFor: user.deletionScheduledFor,
      cancelDeadline: user.deletionScheduledFor,
    };
  }

  async cancelDeletion(token: string) {
    const user = await this.userModel.findOne({
      deletionCancelToken: createHash('sha256').update(token).digest('hex'),
      deletionCancelExpires: { $gt: new Date() },
    });
    if (!user) {
      throw new BadRequestException(
        'This cancellation link is invalid or has expired.',
      );
    }

    user.deletionRequestedAt = undefined;
    user.deletionScheduledFor = undefined;
    user.deletionCancelToken = undefined;
    user.deletionCancelExpires = undefined;
    await user.save();

    // Cosmetic: never block a restore on a delivery failure.
    try {
      await this.emailService.sendAccountDeletionCancelledEmail(
        user.email,
        user.name,
      );
    } catch {
      this.logger.warn(
        `Cancellation email to ${user.email} failed; continuing anyway`,
      );
    }

    return {
      message:
        'Welcome back — your account deletion has been cancelled. Your account is active again.',
    };
  }

  /** Verifies the re-auth factor required to start a deletion. */
  private async reauthenticate(user: User, dto: DeleteAccountDto) {
    if (user.twoFactorEnabled) {
      if (!dto.twoFactorCode) {
        throw new BadRequestException(
          'Enter a code from your authenticator app to delete your account.',
        );
      }
      await this.twoFactorService.verifyForSensitiveAction(
        String(user._id),
        dto.twoFactorCode,
      );
      return;
    }

    if (dto.password) {
      const valid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!valid)
        throw new UnauthorizedException('That password is incorrect.');
      return;
    }

    // Social-only accounts have no password the person could know.
    const isSocialOnly = Boolean(user.googleId || user.facebookId);
    if (isSocialOnly) return;

    throw new BadRequestException(
      'Enter your password to delete your account.',
    );
  }

  // ---- Export ----

  async exportUserData(userId: string) {
    const uid = this.toObjectId(userId);
    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException('User not found');

    const [
      hangoutsCreated,
      hangoutsAttending,
      hangoutsRequested,
      tickets,
      checkIns,
      messages,
      privateChats,
      notifications,
      following,
      followers,
      activities,
      ratingsGiven,
      ratingsReceived,
    ] = await Promise.all([
      this.hangoutModel.find({ createdBy: uid }).lean(),
      this.hangoutModel.find({ attendees: uid }).lean(),
      this.hangoutModel.find({ requestedBy: uid }).lean(),
      this.ticketModel.find({ userId: uid }).lean(),
      this.checkInModel.find({ userId: uid }).lean(),
      this.messageModel.find({ userId: uid }).lean(),
      this.privateChatModel
        .find({ $or: [{ requester: uid }, { recipient: uid }] })
        .lean(),
      this.notificationModel.find({ userId: uid }).lean(),
      this.followModel.find({ follower: uid }).lean(),
      this.followModel.find({ following: uid }).lean(),
      this.activityModel.find({ actor: uid }).lean(),
      this.ratingModel.find({ raterId: uid }).lean(),
      this.ratingModel.find({ ratedId: uid }).lean(),
    ]);

    const chatIds = privateChats.map((c) => c._id);
    const privateMessages = chatIds.length
      ? await this.privateMessageModel.find({ chatId: { $in: chatIds } }).lean()
      : [];

    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      account: this.sanitizeUser(user),
      hangoutsCreated,
      hangoutsAttending,
      hangoutsRequested,
      tickets,
      checkIns,
      messages,
      privateChats,
      privateMessages,
      notifications,
      following,
      followers,
      activities,
      ratingsGiven,
      ratingsReceived,
    };
  }

  private sanitizeUser(user: Record<string, any>) {
    const safe: Record<string, any> = { ...user };
    for (const key of [
      'passwordHash',
      'otpCode',
      'otpExpiry',
      'passwordResetToken',
      'passwordResetExpires',
      'twoFactorSecret',
      'twoFactorPendingSecret',
      'twoFactorPendingExpires',
      'twoFactorRecoveryCodes',
      'twoFactorLastUsedStep',
      'twoFactorFailedAttempts',
      'twoFactorLockedUntil',
      'deletionCancelToken',
      'deletionCancelExpires',
      'purgeStartedAt',
      '__v',
    ]) {
      delete safe[key];
    }
    return safe;
  }

  // ---- Permanent purge ----

  /** Purges every account whose grace period has elapsed. Safe to run often. */
  async purgeDueAccounts(): Promise<number> {
    const due = await this.userModel
      .find({
        deletionScheduledFor: { $lte: new Date() },
        purgeStartedAt: { $exists: false },
      })
      .select('_id')
      .lean();

    let purged = 0;
    for (const { _id } of due) {
      try {
        if (await this.purgeAccount(String(_id as Types.ObjectId))) purged += 1;
      } catch (error) {
        this.logger.error(
          `Purge failed for ${String(_id as Types.ObjectId)}: ${(error as Error).message}`,
        );
      }
    }
    return purged;
  }

  /** Permanently erases one account. Returns false if it was already claimed. */
  async purgeAccount(userId: string): Promise<boolean> {
    // Claim the account so two concurrent sweeps can't purge it twice.
    const user = await this.userModel.findOneAndUpdate(
      { _id: this.toObjectId(userId), purgeStartedAt: { $exists: false } },
      { $set: { purgeStartedAt: new Date() } },
      { new: true },
    );
    if (!user) return false;

    const uid = new Types.ObjectId(String(user._id));

    try {
      await this.eraseMedia(uid);

      // Reputation of the people this user rated must be recomputed after their
      // ratings are removed.
      const affected = await this.ratingModel.distinct('ratedId', {
        raterId: uid,
      });

      // Delete the person's private data outright.
      const chats = await this.privateChatModel
        .find({ $or: [{ requester: uid }, { recipient: uid }] })
        .select('_id')
        .lean();
      const chatIds = chats.map((c) => c._id);
      if (chatIds.length) {
        await this.privateMessageModel.deleteMany({ chatId: { $in: chatIds } });
        await this.privateChatModel.deleteMany({ _id: { $in: chatIds } });
      }

      await Promise.all([
        this.notificationModel.deleteMany({
          $or: [{ userId: uid }, { actor: uid }],
        }),
        this.pushSubscriptionModel.deleteMany({ userId: uid }),
        this.followModel.deleteMany({
          $or: [{ follower: uid }, { following: uid }],
        }),
        this.joinRequestModel.deleteMany({ userId: uid }),
        this.ticketModel.deleteMany({ userId: uid }),
        this.checkInModel.deleteMany({ userId: uid }),
        this.ratingModel.deleteMany({
          $or: [{ raterId: uid }, { ratedId: uid }],
        }),
        this.activityModel.deleteMany({
          $or: [{ actor: uid }, { targetUser: uid }],
        }),
      ]);

      const deletedUser = await this.getOrCreateDeletedUser();
      const ghostId = new Types.ObjectId(String(deletedUser._id));

      // Keep shared content, but detach the person's identity from it.
      await this.anonymizeMessages(uid, ghostId);
      await this.detachFromHangouts(uid);

      // Finally remove the account itself.
      await this.userModel.deleteOne({ _id: uid });

      for (const ratedId of affected) {
        try {
          await this.ratingsService.recomputeReputation(String(ratedId));
        } catch (error) {
          this.logger.warn(
            `Reputation recompute failed for ${String(ratedId)}: ${(error as Error).message}`,
          );
        }
      }

      this.realtime.emitToUser(String(user._id), 'account:deleted', {});
      this.logger.log(`Purged account ${String(user._id)}`);
      return true;
    } catch (error) {
      // Release the claim so a later sweep retries.
      await this.userModel.updateOne(
        { _id: uid },
        { $unset: { purgeStartedAt: '' } },
      );
      throw error;
    }
  }

  /** Re-points message authorship at the shared "Deleted user" and strips refs. */
  private async anonymizeMessages(
    uid: Types.ObjectId,
    ghostId: Types.ObjectId,
  ) {
    await this.messageModel.updateMany(
      {
        $or: [
          { userId: uid },
          { mentions: uid },
          { pinnedBy: uid },
          { 'readBy.userId': uid },
          { 'replyTo.userId': uid },
          { 'poll.options.votes': uid },
        ],
      },
      [
        {
          $set: {
            userId: {
              $cond: [{ $eq: ['$userId', uid] }, ghostId, '$userId'],
            },
            pinnedBy: {
              $cond: [{ $eq: ['$pinnedBy', uid] }, '$$REMOVE', '$pinnedBy'],
            },
            mentions: {
              $setDifference: [{ $ifNull: ['$mentions', []] }, [uid]],
            },
            readBy: {
              $filter: {
                input: { $ifNull: ['$readBy', []] },
                as: 'r',
                cond: { $ne: ['$$r.userId', uid] },
              },
            },
            replyTo: {
              $cond: [
                { $eq: [{ $ifNull: ['$replyTo', null] }, null] },
                '$replyTo',
                {
                  $cond: [
                    { $eq: ['$replyTo.userId', uid] },
                    { $mergeObjects: ['$replyTo', { userId: ghostId }] },
                    '$replyTo',
                  ],
                },
              ],
            },
            poll: {
              $cond: [
                { $ifNull: ['$poll', false] },
                {
                  $mergeObjects: [
                    '$poll',
                    {
                      options: {
                        $map: {
                          input: '$poll.options',
                          as: 'o',
                          in: {
                            $mergeObjects: [
                              '$$o',
                              {
                                votes: {
                                  $setDifference: [
                                    { $ifNull: ['$$o.votes', []] },
                                    [uid],
                                  ],
                                },
                              },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
                '$poll',
              ],
            },
          },
        },
      ] as any,
    );

    // Reactions are a Map<emoji, userId[]>; the keys are dynamic, so pull the
    // user out one emoji bucket at a time.
    const reactionKeys = await this.messageModel.aggregate<{ _id: string }>([
      {
        $project: { keys: { $objectToArray: { $ifNull: ['$reactions', {}] } } },
      },
      { $unwind: '$keys' },
      { $match: { 'keys.v': uid } },
      { $group: { _id: '$keys.k' } },
    ]);
    for (const { _id: key } of reactionKeys) {
      await this.messageModel.updateMany({ [`reactions.${key}`]: uid }, {
        $pull: { [`reactions.${key}`]: uid },
      } as any);
    }
  }

  /** Removes the user from hangouts, re-pointing organizer refs at "Deleted user". */
  private async detachFromHangouts(uid: Types.ObjectId) {
    const ghost = await this.getOrCreateDeletedUser();
    const ghostId = new Types.ObjectId(String(ghost._id));

    await this.hangoutModel.updateMany({}, {
      $pull: {
        attendees: uid,
        requestedBy: uid,
        blastedBy: uid,
      },
    } as any);
    await this.hangoutModel.updateMany(
      { createdBy: uid },
      { $set: { createdBy: ghostId } },
    );
    await this.hangoutModel.updateMany(
      { sponsorId: uid },
      { $unset: { sponsorId: '' } },
    );
  }

  /** Collects and destroys the user's Cloudinary attachments (best effort). */
  private async eraseMedia(uid: Types.ObjectId) {
    const groupAttachments = await this.messageModel
      .find({ userId: uid, 'attachment.publicId': { $exists: true } })
      .select('attachment')
      .lean();

    const chats = await this.privateChatModel
      .find({ $or: [{ requester: uid }, { recipient: uid }] })
      .select('_id')
      .lean();
    const chatIds = chats.map((c) => c._id);
    const privateAttachments = chatIds.length
      ? await this.privateMessageModel
          .find({
            chatId: { $in: chatIds },
            'attachment.publicId': { $exists: true },
          })
          .select('attachment')
          .lean()
      : [];

    const attachments = [...groupAttachments, ...privateAttachments]
      .map((m) => m.attachment)
      .filter((a): a is MessageAttachment => Boolean(a?.publicId));

    for (const attachment of attachments) {
      await this.uploadService.destroy(
        attachment.publicId,
        attachment.mimeType,
      );
    }
  }

  /** Find-or-create the shared stand-in account used for anonymized content. */
  async getOrCreateDeletedUser(): Promise<User> {
    const existing = await this.userModel.findOne({
      email: DELETED_USER_EMAIL,
    });
    if (existing) return existing;

    const user = new this.userModel({
      name: 'Deleted user',
      email: DELETED_USER_EMAIL,
      // Unguessable, so nobody can ever sign in as this account.
      passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
      verified: false,
    });
    try {
      return await user.save();
    } catch (error) {
      // Two purges can race to create it; the loser just loads the winner.
      if ((error as { code?: number }).code === 11000) {
        return (await this.userModel.findOne({
          email: DELETED_USER_EMAIL,
        })) as User;
      }
      throw error;
    }
  }

  private toObjectId(id: string): Types.ObjectId {
    return Types.ObjectId.isValid(id)
      ? new Types.ObjectId(id)
      : new Types.ObjectId();
  }
}
