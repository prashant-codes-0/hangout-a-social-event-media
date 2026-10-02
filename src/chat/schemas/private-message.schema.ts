import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class PrivateMessage extends Document {
  @Prop({ type: Types.ObjectId, ref: 'PrivateChat', required: true, index: true })
  chatId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ required: true })
  content: string;
}

export const PrivateMessageSchema = SchemaFactory.createForClass(PrivateMessage);
