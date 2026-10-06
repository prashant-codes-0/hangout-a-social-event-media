import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

// Snapshot of the message being replied to, so the quote still shows when the original
// isn't loaded or has since been deleted
@Schema({ _id: false })
export class ReplyPreview {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  messageId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ default: '' })
  authorName: string;

  // First ~140 characters of the original
  @Prop({ default: '' })
  content: string;
}

export const ReplyPreviewSchema = SchemaFactory.createForClass(ReplyPreview);

// Read receipt: who has seen the message and when
@Schema({ _id: false })
export class ReadReceipt {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  readAt: Date;
}

export const ReadReceiptSchema = SchemaFactory.createForClass(ReadReceipt);

// flattenMaps: send `reactions` to clients as a plain { emoji: userIds[] } object
@Schema({ timestamps: true, toJSON: { flattenMaps: true } })
export class Message extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Hangout', required: true })
  hangoutId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  content: string;

  @Prop({ default: 'text', enum: ['text', 'image', 'system'] })
  messageType: string;

  @Prop({ default: false })
  isEdited: boolean;

  @Prop({ type: Date })
  editedAt?: Date;

  // Pinned by the hangout organizer (or an admin); at most 3 per hangout
  @Prop({ default: false })
  pinned: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  pinnedBy?: Types.ObjectId;

  @Prop({ type: Date })
  pinnedAt?: Date;

  // emoji -> ids of users who reacted with it (keys are removed when their list empties)
  @Prop({ type: Map, of: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }], default: {} })
  reactions: Map<string, Types.ObjectId[]>;

  @Prop({ type: ReplyPreviewSchema })
  replyTo?: ReplyPreview;

  // Everyone except the sender who has seen it
  @Prop({ type: [ReadReceiptSchema], default: [] })
  readBy: ReadReceipt[];
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ hangoutId: 1, pinned: 1, pinnedAt: 1 });
// "mark everything up to here as read" scans by hangout + time
MessageSchema.index({ hangoutId: 1, createdAt: 1 });