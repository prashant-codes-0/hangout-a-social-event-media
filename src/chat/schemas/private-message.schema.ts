import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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
  @Prop({ type: Types.ObjectId, ref: 'PrivateChat', required: true, index: true })
  chatId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ required: true })
  content: string;

  // 'call' messages are written by the server when a call ends
  @Prop({ default: 'text', enum: ['text', 'call'] })
  messageType: 'text' | 'call';

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

export const PrivateMessageSchema = SchemaFactory.createForClass(PrivateMessage);
PrivateMessageSchema.index({ chatId: 1, pinned: 1, pinnedAt: 1 });
