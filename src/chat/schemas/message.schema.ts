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
}

export const MessageSchema = SchemaFactory.createForClass(Message);