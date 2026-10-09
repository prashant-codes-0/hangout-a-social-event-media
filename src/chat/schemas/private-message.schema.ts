import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  LinkPreview,
  LinkPreviewSchema,
  MessageAttachment,
  MessageAttachmentSchema,
} from './message.schema';

export type CallLogStatus = 'completed' | 'missed' | 'declined' | 'busy';

// Details of a call, for messages of type 'call' (sender = the caller)
@Schema({ _id: false })
export class CallLog {
  @Prop({ required: true, enum: ['audio', 'video'] })
  callType: 'audio' | 'video';

  @Prop({ required: true, enum: ['completed', 'missed', 'declined', 'busy'] })
  status: CallLogStatus;

  // Talk time for completed calls
  @Prop({ default: 0 })
  durationSeconds: number;
}

export const CallLogSchema = SchemaFactory.createForClass(CallLog);

@Schema({ timestamps: true })
export class PrivateMessage extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'PrivateChat',
    required: true,
    index: true,
  })
  chatId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  // Text usually, but image/file/voice messages carry no text (empty string)
  @Prop({ type: String, default: '' })
  content: string;

  // 'call' messages are written by the server when a call ends;
  // image/file/voice messages carry an attachment of the matching kind
  @Prop({ default: 'text', enum: ['text', 'call', 'image', 'file', 'voice'] })
  messageType: 'text' | 'call' | 'image' | 'file' | 'voice';

  @Prop({ type: MessageAttachmentSchema })
  attachment?: MessageAttachment;

  // og-tags of the first link in `content`, added asynchronously after send
  @Prop({ type: LinkPreviewSchema })
  linkPreview?: LinkPreview;

  @Prop({ type: CallLogSchema })
  call?: CallLog;

  // Either participant can pin; at most 3 per chat
  @Prop({ default: false })
  pinned: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  pinnedBy?: Types.ObjectId;

  @Prop({ type: Date })
  pinnedAt?: Date;
}

export const PrivateMessageSchema =
  SchemaFactory.createForClass(PrivateMessage);
PrivateMessageSchema.index({ chatId: 1, pinned: 1, pinnedAt: 1 });
