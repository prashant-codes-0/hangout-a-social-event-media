import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PrivateChat, PrivateChatStatus } from './schemas/private-chat.schema';
import { PrivateMessage } from './schemas/private-message.schema';
import { Hangout } from '../hangouts/schemas/hangout.schema';

@Injectable()
export class PrivateChatService {
  constructor(
    @InjectModel(PrivateChat.name)
    private privateChatModel: Model<PrivateChat>,
    @InjectModel(PrivateMessage.name)
    private privateMessageModel: Model<PrivateMessage>,
    @InjectModel(Hangout.name)
    private hangoutModel: Model<Hangout>,
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
      } else if (existing.status === PrivateChatStatus.DECLINED) {
        // Allow asking again after a decline
        existing.requester = new Types.ObjectId(requesterId);
        existing.recipient = new Types.ObjectId(recipientId);
        existing.status = PrivateChatStatus.PENDING;
        await existing.save();
      }
      return this.populateChat(existing);
    }

    const chat = new this.privateChatModel({
      hangoutId,
      requester: requesterId,
      recipient: recipientId,
    });
    await chat.save();
    return this.populateChat(chat);
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
    return this.populateChat(chat);
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

    return { chat, message };
  }
}
