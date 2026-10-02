import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum PrivateChatStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
}

@Schema({ timestamps: true })
export class PrivateChat extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Hangout', required: true })
  hangoutId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  requester: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recipient: Types.ObjectId;

  @Prop({ default: PrivateChatStatus.PENDING, enum: Object.values(PrivateChatStatus) })
  status: PrivateChatStatus;

  @Prop({ type: Date })
  lastMessageAt?: Date;
}

export const PrivateChatSchema = SchemaFactory.createForClass(PrivateChat);
PrivateChatSchema.index({ hangoutId: 1, requester: 1, recipient: 1 });
