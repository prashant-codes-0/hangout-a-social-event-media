import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PrivateChat, PrivateChatStatus } from './schemas/private-chat.schema';
import { PrivateMessage, CallLogStatus } from './schemas/private-message.schema';
import { MAX_PINNED } from './chat.service';
import { Hangout } from '../hangouts/schemas/hangout.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';

@Injectable()
export class PrivateChatService {
  constructor(
    @InjectModel(PrivateChat.name)
    private privateChatModel: Model<PrivateChat>,
    @InjectModel(PrivateMessage.name)
    private privateMessageModel: Model<PrivateMessage>,
    @InjectModel(Hangout.name)
    private hangoutModel: Model<Hangout>,
    private notifications: NotificationsService,
  ) {}

  private isMember(hangout: Hangout, userId: string): boolean {
    return (
      hangout.createdBy.toString() === userId ||
      hangout.attendees.some(attendeeId => attendeeId.toString() === userId)
    );
  }

  private populateChat(chat: PrivateChat) {
    return chat.populate([
      { path: 'requester', select: 'name email' },
      { path: 'recipient', select: 'name email' },
    ]);
  }

  private async getChatForParticipant(chatId: string, userId: string) {
    if (!Types.ObjectId.isValid(chatId)) {
      throw new NotFoundException('Private chat not found');
    }
    const chat = await this.privateChatModel.findById(chatId);
    if (!chat) {
      throw new NotFoundException('Private chat not found');
    }
    if (chat.requester.toString() !== userId && chat.recipient.toString() !== userId) {
      throw new ForbiddenException('You are not part of this private chat');
    }
    return chat;
  }

  // Ids of both participants, for real-time notifications
  getParticipantIds(chat: PrivateChat): string[] {
    const ids = [chat.requester, chat.recipient].map((u: any) => (u._id ?? u).toString());
    return ids;
  }

  async requestChat(hangoutId: string, requesterId: string, recipientId: string) {
    if (requesterId === recipientId) {
      throw new BadRequestException('You cannot start a private chat with yourself');
    }
    if (!Types.ObjectId.isValid(hangoutId) || !Types.ObjectId.isValid(recipientId)) {
      throw new BadRequestException('Invalid hangout or user id');
    }

    const hangout = await this.hangoutModel.findById(hangoutId);
    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }
    if (!this.isMember(hangout, requesterId)) {
      throw new ForbiddenException('You must be part of this hangout to request a private chat');
    }
    if (!this.isMember(hangout, recipientId)) {
      throw new BadRequestException('That user is not part of this hangout');
    }

    const existing = await this.privateChatModel.findOne({
      hangoutId,
      $or: [
        { requester: requesterId, recipient: recipientId },
        { requester: recipientId, recipient: requesterId },
      ],
    });

    if (existing) {
      if (existing.status === PrivateChatStatus.PENDING && existing.recipient.toString() === requesterId) {
        // The other user already asked us - treat this as accepting their request
        existing.status = PrivateChatStatus.ACCEPTED;
        await existing.save();
        await this.populateChat(existing);
        this.alertAccepted(existing, hangout, requesterId);
        return existing;
      } else if (existing.status === PrivateChatStatus.DECLINED) {
        // Allow asking again after a decline
        existing.requester = new Types.ObjectId(requesterId);
        existing.recipient = new Types.ObjectId(recipientId);
        existing.status = PrivateChatStatus.PENDING;
        await existing.save();
        await this.populateChat(existing);
        this.alertRequested(existing, hangout);
        return existing;
      }
      // Already pending from us, or already accepted: no new alert
      return this.populateChat(existing);
    }

    const chat = new this.privateChatModel({
      hangoutId,
      requester: requesterId,
      recipient: recipientId,
    });
    await chat.save();
    await this.populateChat(chat);
    this.alertRequested(chat, hangout);
    return chat;
  }

  // ---- Alerts (fire and forget; NotificationsService never throws) ----

  private chatLink(chat: PrivateChat) {
    return `/hangouts/details/${chat.hangoutId}?chat=${chat._id}`;
  }

  // Recipient: "<requester> wants to chat privately"
  private alertRequested(chat: PrivateChat, hangout: Hangout) {
    const requester: any = chat.requester;
    this.notifications.notify((chat.recipient as any)._id.toString(), {
      type: NotificationType.CHAT_REQUEST,
      actorId: requester._id.toString(),
      hangoutId: String(hangout._id),
      chatId: String(chat._id),
      title: 'New private chat request',
      body: `${requester.name} wants to chat privately · ${hangout.title}`,
      link: this.chatLink(chat),
    });
  }

  // Original requester: "<acceptedBy> accepted your chat request"
  private alertAccepted(chat: PrivateChat, hangout: { _id: any; title: string } | null, acceptedById: string) {
    const requester: any = chat.requester;
    const recipient: any = chat.recipient;
    const accepter = recipient._id.toString() === acceptedById ? recipient : requester;
    const notifyUser = accepter === recipient ? requester : recipient;
    this.notifications.notify(notifyUser._id.toString(), {
      type: NotificationType.CHAT_ACCEPTED,
      actorId: acceptedById,
      hangoutId: chat.hangoutId.toString(),
      chatId: String(chat._id),
      title: 'Chat request accepted',
      body: `${accepter.name} accepted your private chat${hangout ? ` · ${hangout.title}` : ''}`,
      link: this.chatLink(chat),
    });
  }

  async respondToRequest(chatId: string, userId: string, accept: boolean) {
    const chat = await this.getChatForParticipant(chatId, userId);

    if (chat.recipient.toString() !== userId) {
      throw new ForbiddenException('Only the recipient can respond to this request');
    }
    if (chat.status !== PrivateChatStatus.PENDING) {
      throw new BadRequestException(`This request has already been ${chat.status}`);
    }

    chat.status = accept ? PrivateChatStatus.ACCEPTED : PrivateChatStatus.DECLINED;
    await chat.save();
    await this.populateChat(chat);

    // Declines are quiet on purpose; acceptances are worth an alert
    if (accept) {
      const hangout = await this.hangoutModel.findById(chat.hangoutId).select('title').lean();
      this.alertAccepted(chat, hangout as any, userId);
    }
    return chat;
  }

  // Validates a call between the two participants of an accepted chat and returns the other participant.
  // Membership is only re-checked when a call starts, not for every signaling message.
  async getCallPeer(chatId: string, userId: string, checkMembership = false) {
    const chat = await this.getChatForParticipant(chatId, userId);
    if (chat.status !== PrivateChatStatus.ACCEPTED) {
      throw new ForbiddenException('This private chat has not been accepted');
    }

    if (checkMembership) {
      const hangout = await this.hangoutModel.findById(chat.hangoutId);
      if (!hangout || !this.isMember(hangout, userId)) {
        throw new ForbiddenException('You are no longer part of this hangout');
      }
    }

    await this.populateChat(chat);
    const isRequester = (chat.requester as any)._id.toString() === userId;
    const me = isRequester ? chat.requester : chat.recipient;
    const peer = isRequester ? chat.recipient : chat.requester;
    return { chat, me: me as any, peerId: (peer as any)._id.toString() };
  }

  async getChatsForHangout(hangoutId: string, userId: string) {
    return this.privateChatModel
      .find({
        hangoutId,
        $or: [{ requester: userId }, { recipient: userId }],
      })
      .populate('requester', 'name email')
      .populate('recipient', 'name email')
      .sort({ updatedAt: -1 })
      .exec();
  }

  async getMessages(chatId: string, userId: string, limit = 50, skip = 0) {
    const chat = await this.getChatForParticipant(chatId, userId);
    if (chat.status !== PrivateChatStatus.ACCEPTED) {
      throw new ForbiddenException('This private chat has not been accepted');
    }

    const messages = await this.privateMessageModel
      .find({ chatId })
      .populate('senderId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    // Oldest first for display
    return messages.reverse();
  }

  async sendMessage(chatId: string, userId: string, content: string) {
    const chat = await this.getChatForParticipant(chatId, userId);
    if (chat.status !== PrivateChatStatus.ACCEPTED) {
      throw new ForbiddenException('This private chat has not been accepted');
    }

    const hangout = await this.hangoutModel.findById(chat.hangoutId);
    if (!hangout || !this.isMember(hangout, userId)) {
      throw new ForbiddenException('You are no longer part of this hangout');
    }

    const message = new this.privateMessageModel({ chatId, senderId: userId, content });
    await message.save();
    await message.populate('senderId', 'name email');

    chat.lastMessageAt = new Date();
    await chat.save();

    // One unread alert per chat that keeps a count, rather than one per message
    const recipientId = chat.requester.toString() === userId ? chat.recipient.toString() : chat.requester.toString();
    const senderName = (message.senderId as any)?.name ?? 'Someone';
    this.notifications.notifyGrouped(recipientId, {
      type: NotificationType.PRIVATE_MESSAGE,
      actorId: userId,
      hangoutId: chat.hangoutId.toString(),
      chatId: String(chat._id),
      title: `New message from ${senderName}`,
      body: content,
      link: this.chatLink(chat),
    });

    return { chat, message };
  }

  // ---- Pinned messages (either participant; at most MAX_PINNED per chat) ----

  async setPinned(chatId: string, messageId: string, userId: string, pinned: boolean) {
    const chat = await this.getChatForParticipant(chatId, userId);
    if (chat.status !== PrivateChatStatus.ACCEPTED) {
      throw new ForbiddenException('This private chat has not been accepted');
    }
    if (!Types.ObjectId.isValid(messageId)) {
      throw new NotFoundException('Message not found');
    }
    const message = await this.privateMessageModel.findById(messageId);
    if (!message || message.chatId.toString() !== chatId) {
      throw new NotFoundException('Message not found');
    }
    if (message.messageType === 'call') {
      throw new BadRequestException('Call entries cannot be pinned');
    }

    // Pinning past the limit unpins the oldest pin
    const unpinnedMessageIds: string[] = [];
    if (pinned && !message.pinned) {
      const current = await this.privateMessageModel
        .find({ chatId: message.chatId, pinned: true })
        .sort({ pinnedAt: 1 });
      for (const old of current.slice(0, Math.max(0, current.length - MAX_PINNED + 1))) {
        old.pinned = false;
        old.pinnedBy = undefined;
        old.pinnedAt = undefined;
        await old.save();
        unpinnedMessageIds.push(String(old._id));
      }
      message.pinned = true;
      message.pinnedBy = userId as any;
      message.pinnedAt = new Date();
    } else if (!pinned) {
      message.pinned = false;
      message.pinnedBy = undefined;
      message.pinnedAt = undefined;
    }
    await message.save();
    await message.populate([
      { path: 'senderId', select: 'name email' },
      { path: 'pinnedBy', select: 'name' },
    ]);

    // Not "message": the response interceptor treats a top-level `message` key as the status text
    return {
      chat,
      event: { chatId, messageId: String(message._id), pinned: message.pinned, pinnedMessage: message, unpinnedMessageIds },
    };
  }

  async getPinned(chatId: string, userId: string) {
    await this.getChatForParticipant(chatId, userId);
    return this.privateMessageModel
      .find({ chatId, pinned: true })
      .sort({ pinnedAt: -1 })
      .populate('senderId', 'name email')
      .populate('pinnedBy', 'name')
      .exec();
  }

  // ---- Call history: one 'call' message per call, written when it ends (sender = caller) ----

  async addCallLog(chatId: string, callerId: string, call: { callType: 'audio' | 'video'; status: CallLogStatus; durationSeconds?: number }) {
    const kind = call.callType === 'video' ? 'video' : 'audio';
    const content =
      call.status === 'completed' ? `${kind === 'video' ? 'Video' : 'Audio'} call`
        : call.status === 'declined' ? `Declined ${kind} call`
          : `Missed ${kind} call`;

    const message = await this.privateMessageModel.create({
      chatId,
      senderId: callerId,
      content,
      messageType: 'call',
      call: { callType: kind, status: call.status, durationSeconds: Math.max(0, Math.round(call.durationSeconds ?? 0)) },
    });
    await message.populate('senderId', 'name email');
    await this.privateChatModel.updateOne({ _id: chatId }, { $set: { lastMessageAt: new Date() } });
    return message;
  }
}
