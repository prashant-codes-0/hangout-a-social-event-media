import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum JoinRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true })
export class JoinRequest extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Hangout', required: true })
  hangoutId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ 
    type: String, 
    enum: JoinRequestStatus, 
    default: JoinRequestStatus.PENDING 
  })
  status: JoinRequestStatus;
}

export const JoinRequestSchema = SchemaFactory.createForClass(JoinRequest);