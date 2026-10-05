import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
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
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ hangoutId: 1, pinned: 1, pinnedAt: 1 });