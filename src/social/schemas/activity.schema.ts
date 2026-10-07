import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export enum ActivityVerb {
  HOSTING = 'hosting', // actor created a hangout
  GOING = 'going', // actor was approved into a hangout
  FOLLOWED = 'followed', // actor started following targetUser
}

// What the people you follow have been up to. Rows are removed again when the action is undone
// (left the hangout, unfollowed), so the feed never shows something that's no longer true.
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Activity extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  actor: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(ActivityVerb) })
  verb: ActivityVerb;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Hangout' })
  hangoutId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  targetUser?: Types.ObjectId;

  createdAt?: Date;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);
ActivitySchema.index({ actor: 1, createdAt: -1 }); // the feed: actors I follow, newest first
ActivitySchema.index({ hangoutId: 1 });
// One row per (actor, verb, hangout/target): repeating an action refreshes it instead of duplicating
ActivitySchema.index(
  { actor: 1, verb: 1, hangoutId: 1, targetUser: 1 },
  { unique: true },
);
