import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RealtimeService } from '../realtime/realtime.service';
import { Notification, NotificationType } from './schemas/notification.schema';

export interface NotifyInput {
  type: NotificationType;
  actorId?: string;
  hangoutId?: string;
  chatId?: string;
  title: string;
  body?: string;
  link: string;
  callType?: 'audio' | 'video';
}

const MAX_PAGE_SIZE = 50;
const SNIPPET_LENGTH = 120;

// Stores user alerts and pushes them live over the chat socket ("notification" event).
// Failures are logged, never thrown: an alert must never break the action that caused it.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
    private realtime: RealtimeService,
  ) {}

  async notify(recipientId: string, input: NotifyInput) {
    if (!recipientId || recipientId === input.actorId) return;
    try {
      const notification = await this.notificationModel.create({
        userId: recipientId,
        type: input.type,
        actor: input.actorId,
        hangoutId: input.hangoutId,
        chatId: input.chatId,
        title: input.title,
        body: this.snippet(input.body),
        link: input.link,
        callType: input.callType,
      });
      await this.push(notification);
    } catch (error) {
      this.logger.error(
        `Failed to notify ${recipientId} (${input.type}): ${(error as Error).message}`,
      );
    }
  }

  // For messages: keep ONE unread alert per chat/hangout and bump its count and latest text,
  // instead of creating an alert per message
  async notifyGrouped(recipientId: string, input: NotifyInput) {
    if (!recipientId || recipientId === input.actorId) return;
    try {
      const filter: any = {
        userId: recipientId,
        type: input.type,
        read: false,
      };
      if (input.chatId) filter.chatId = input.chatId;
      if (input.hangoutId && !input.chatId) filter.hangoutId = input.hangoutId;

      const notification = await this.notificationModel.findOneAndUpdate(
        filter,
        {
          $inc: { count: 1 },
          $set: {
            title: input.title,
            body: this.snippet(input.body),
            link: input.link,
            actor: input.actorId,
          },
          $setOnInsert: { hangoutId: input.hangoutId, chatId: input.chatId },
        },
        { upsert: true, new: true, setDefaultsOnInsert: false },
      );
      await this.push(notification);
    } catch (error) {
      this.logger.error(
        `Failed to notify ${recipientId} (${input.type}): ${(error as Error).message}`,
      );
    }
  }

  async list(userId: string, before?: string, limit = 20) {
    const query: any = { userId };
    if (before) {
      const date = new Date(before);
      if (!isNaN(date.getTime())) query.updatedAt = { $lt: date };
    }
    const size = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    const items = await this.notificationModel
      .find(query)
      .sort({ updatedAt: -1 })
      .limit(size + 1) // one extra to know whether there are more
      .populate('actor', 'name email')
      .exec();
    return { items: items.slice(0, size), hasMore: items.length > size };
  }

  async unreadCount(userId: string) {
    return {
      count: await this.notificationModel.countDocuments({
        userId,
        read: false,
      }),
    };
  }

  async markRead(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Notification not found');
    const result = await this.notificationModel.updateOne(
      { _id: id, userId },
      { $set: { read: true } },
    );
    if (result.matchedCount === 0)
      throw new NotFoundException('Notification not found');
    return { id, read: true };
  }

  async markAllRead(userId: string) {
    const result = await this.notificationModel.updateMany(
      { userId, read: false },
      { $set: { read: true } },
    );
    return { updated: result.modifiedCount };
  }

  // Used when the user opens a chat: its message alerts no longer need attention
  async markReadByContext(
    userId: string,
    context: { chatId?: string; hangoutId?: string },
  ) {
    const query: any = { userId, read: false };
    if (context.chatId && Types.ObjectId.isValid(context.chatId)) {
      query.chatId = context.chatId;
      query.type = {
        $in: [NotificationType.PRIVATE_MESSAGE, NotificationType.CHAT_ACCEPTED],
      };
    } else if (context.hangoutId && Types.ObjectId.isValid(context.hangoutId)) {
      query.hangoutId = context.hangoutId;
      query.type = NotificationType.GROUP_MESSAGE;
    } else {
      return { updated: 0 };
    }
    const result = await this.notificationModel.updateMany(query, {
      $set: { read: true },
    });
    return { updated: result.modifiedCount };
  }

  private async push(notification: Notification) {
    await notification.populate('actor', 'name email');
    this.realtime.emitToUser(
      notification.userId.toString(),
      'notification',
      notification.toJSON(),
    );
  }

  private snippet(text?: string) {
    const clean = (text || '').replace(/\s+/g, ' ').trim();
    return clean.length > SNIPPET_LENGTH
      ? clean.slice(0, SNIPPET_LENGTH - 1) + '…'
      : clean;
  }
}
