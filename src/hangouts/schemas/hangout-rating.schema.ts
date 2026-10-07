import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// One participant's 1-5 score for another after a hangout has finished
@Schema({ timestamps: true })
export class HangoutRating extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Hangout', required: true })
  hangoutId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  raterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ratedId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  score: number;
}

export const HangoutRatingSchema = SchemaFactory.createForClass(HangoutRating);

// One score per person per hangout; also powers "who can I rate?" lookups
HangoutRatingSchema.index({ hangoutId: 1, raterId: 1, ratedId: 1 }, { unique: true });
HangoutRatingSchema.index({ ratedId: 1 });
