import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message } from './schemas/message.schema';
import { Hangout } from '../hangouts/schemas/hangout.schema';
import { User } from '../auth/schemas/user.schema';
import { SendMessageDto, EditMessageDto } from './dto/chat.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name)
    private messageModel: Model<Message>,
    @InjectModel(Hangout.name)
    private hangoutModel: Model<Hangout>,
    @InjectModel(User.name)
    private userModel: Model<User>,
    private notifications: NotificationsService,
    private realtime: RealtimeService,
  ) {}

  async sendMessage(sendMessageDto: SendMessageDto, userId: string) {
    const { hangoutId, content, messageType = 'text' } = sendMessageDto;

    // Access validation is now handled by HangoutAccessGuard at the controller level
    // Create message
    const message = new this.messageModel({
      hangoutId,
      userId,
      content,
      messageType,
    });

    await message.save();

    // Populate user info for response
    await message.populate('userId', 'name email');
    
    return message;
  }

  async getMessages(hangoutId: string, userId: string, limit = 50, skip = 0, restrictHistory = false) {
    // Access validation is handled by HangoutAccessGuard
    
    // Build query
    const query: any = { hangoutId };
    
    // Option: Restrict to last 24 hours for new users
    if (restrictHistory) {
      const last24Hours = new Date();
      last24Hours.setHours(last24Hours.getHours() - 24);
      query.createdAt = { $gte: last24Hours };
    }

    return this.messageModel
      .find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .exec();
  }

  async getRecentMessages(hangoutId: string, userId: string, hours = 24) {
    // Access validation is handled by HangoutAccessGuard
    
    const fromTime = new Date();
    fromTime.setHours(fromTime.getHours() - hours);
    
    const query = { 
      hangoutId,
      createdAt: { $gte: fromTime }
    };

    return this.messageModel
      .find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }

  async editMessage(messageId: string, editMessageDto: EditMessageDto, userId: string, isAdmin: boolean = false) {
    const message = await this.messageModel.findById(messageId);
    
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Admins can edit any message, regular users can only edit their own
    if (!isAdmin && message.userId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    message.content = editMessageDto.content;
    message.isEdited = true;
    message.editedAt = new Date();

    await message.save();
    await message.populate('userId', 'name email');

    return message;
  }

  async deleteMessage(messageId: string, userId: string, isAdmin: boolean = false) {
    const message = await this.messageModel.findById(messageId);
    
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Admins can delete any message, regular users can only delete their own
    if (!isAdmin && message.userId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    await this.messageModel.findByIdAndDelete(messageId);

    return { message: 'Message deleted successfully', messageId };
  }

  // Alert hangout members about a group message, except the sender and anyone currently viewing
  // this hangout's chat (they're in its socket room). Grouped: one unread alert per hangout.
  // Never throws: alerts must not break sending.
  async notifyGroupMessage(message: Message, senderId: string) {
    try {
      const hangoutId = message.hangoutId.toString();
      const hangout = await this.hangoutModel.findById(hangoutId).select('title attendees createdBy').lean();
      if (!hangout) return;

      const viewing = await this.realtime.userIdsInRoom(`hangout_${hangoutId}`);
      const memberIds = new Set([hangout.createdBy, ...hangout.attendees].map(id => id.toString()));
      const senderName = (message.userId as any)?.name ?? 'Someone';

      await Promise.all(
        [...memberIds]
          .filter(id => id !== senderId && !viewing.has(id))
          .map(id => this.notifications.notifyGrouped(id, {
            type: NotificationType.GROUP_MESSAGE,
            actorId: senderId,
            hangoutId,
            title: `New messages in ${hangout.title}`,
            body: `${senderName}: ${message.content}`,
            link: `/hangouts/details/${hangoutId}`,
          })),
      );
    } catch (error) {
      console.error('Failed to send group message alerts:', error.message);
    }
  }

  async checkUserAccess(hangoutId: string, userId: string): Promise<boolean> {
    const hangout = await this.hangoutModel.findById(hangoutId);
    if (!hangout) {
      return false;
    }

    const isAttendee = hangout.attendees.some(
      attendeeId => attendeeId.toString() === userId
    );
    const isCreator = hangout.createdBy.toString() === userId;

    return isAttendee || isCreator;
  }
}