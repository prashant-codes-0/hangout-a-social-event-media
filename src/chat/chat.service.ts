import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message } from './schemas/message.schema';
import { Hangout } from '../hangouts/schemas/hangout.schema';
import { User } from '../auth/schemas/user.schema';
import { SendMessageDto, EditMessageDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name)
    private messageModel: Model<Message>,
    @InjectModel(Hangout.name)
    private hangoutModel: Model<Hangout>,
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  async sendMessage(sendMessageDto: SendMessageDto, userId: string) {
    const { hangoutId, content, messageType = 'text' } = sendMessageDto;

    // Check if hangout exists
    const hangout = await this.hangoutModel.findById(hangoutId);
    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    // Check if user is an attendee or creator
    const isAttendee = hangout.attendees.some(
      attendeeId => attendeeId.toString() === userId
    );
    const isCreator = hangout.createdBy.toString() === userId;

    if (!isAttendee && !isCreator) {
      throw new ForbiddenException('You must be an attendee to send messages');
    }

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

  async getMessages(hangoutId: string, userId: string, limit = 50, skip = 0) {
    // Check if hangout exists
    const hangout = await this.hangoutModel.findById(hangoutId);
    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    // Check if user is an attendee or creator
    const isAttendee = hangout.attendees.some(
      attendeeId => attendeeId.toString() === userId
    );
    const isCreator = hangout.createdBy.toString() === userId;

    if (!isAttendee && !isCreator) {
      throw new ForbiddenException('You must be an attendee to view messages');
    }

    return this.messageModel
      .find({ hangoutId })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .exec();
  }

  async editMessage(messageId: string, editMessageDto: EditMessageDto, userId: string) {
    const message = await this.messageModel.findById(messageId);
    
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.userId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    message.content = editMessageDto.content;
    message.isEdited = true;
    message.editedAt = new Date();

    await message.save();
    await message.populate('userId', 'name email');

    return message;
  }

  async deleteMessage(messageId: string, userId: string) {
    const message = await this.messageModel.findById(messageId);
    
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.userId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    await this.messageModel.findByIdAndDelete(messageId);

    return { message: 'Message deleted successfully', messageId };
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