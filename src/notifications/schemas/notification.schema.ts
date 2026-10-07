import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum NotificationType {
  JOIN_REQUEST = 'join_request',
  JOIN_APPROVED = 'join_approved',
  JOIN_REJECTED = 'join_rejected',
  CHAT_REQUEST = 'chat_request',
  CHAT_ACCEPTED = 'chat_accepted',
  PRIVATE_MESSAGE = 'private_message',
  GROUP_MESSAGE = 'group_message',
  MISSED_CALL = 'missed_call',
  // Scheduled by HangoutsScheduler: upcoming / starting / cancelled alerts
  HANGOUT_REMINDER = 'hangout_reminder',
  HANGOUT_CANCELLED = 'hangout_cancelled',
  HANGOUT_STARTED = 'hangout_started',
  NEW_FOLLOWER = 'new_follower',
}

// Alerts are removed automatically after this long
export const NOTIFICATION_TTL_SECONDS = 60 * 24 * 60 * 60;

@Schema({ timestamps: true })
export class Notification extends Document {
  // Who receives the alert
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(NotificationType) })
  type: NotificationType;

  // Who caused it (requester, sender, caller, ...)
  @Prop({ type: Types.ObjectId, ref: 'User' })
  actor?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Hangout' })
  hangoutId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PrivateChat' })
  chatId?: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  body: string;

  // Frontend route to open when clicked
  @Prop({ required: true })
  link: string;

  // Grouped alerts (messages): how many events this one stands for
  @Prop({ default: 1 })
  count: number;

  @Prop({ default: false })
  read: boolean;

  @Prop({ enum: ['audio', 'video'] })
  callType?: 'audio' | 'video';

  createdAt?: Date;
  updatedAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, read: 1, updatedAt: -1 });
NotificationSchema.index({ userId: 1, updatedAt: -1 });
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: NOTIFICATION_TTL_SECONDS },
);
