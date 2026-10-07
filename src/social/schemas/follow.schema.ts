import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

// "follower follows following". One-way, no approval needed; two people who follow each other
// are shown as friends.
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Follow extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  follower: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  following: Types.ObjectId;

  createdAt?: Date;
}

export const FollowSchema = SchemaFactory.createForClass(Follow);
FollowSchema.index({ follower: 1, following: 1 }, { unique: true });
FollowSchema.index({ following: 1, createdAt: -1 }); // someone's followers, newest first
FollowSchema.index({ follower: 1, createdAt: -1 }); // who someone follows
