import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Hangout extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  purpose: string;

  @Prop({ required: true })
  place: string;

  @Prop({ required: true })
  time: Date;

  @Prop({ default: false })
  sponsored: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  sponsorId?: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  attendees: Types.ObjectId[];

  @Prop({ default: 0 })
  blasts: number;

  @Prop({ default: 10 })
  capacity: number;

  @Prop({ default: true })
  isPublic: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const HangoutSchema = SchemaFactory.createForClass(Hangout);