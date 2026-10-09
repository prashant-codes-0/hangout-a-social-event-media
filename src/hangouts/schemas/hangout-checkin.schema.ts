import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// One attendee's venue check-in for a hangout, taken with the code the
// organizer shows (QR/signboard), by GPS proximity to the venue, or by the
// organizer scanning the attendee's ticket.
@Schema({ timestamps: true })
export class HangoutCheckIn extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Hangout', required: true })
  hangoutId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ enum: ['code', 'geo', 'ticket'], required: true })
  method: 'code' | 'geo' | 'ticket';

  // Metres from the venue at the moment of a proximity check-in
  @Prop()
  distanceM?: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const HangoutCheckInSchema = SchemaFactory.createForClass(HangoutCheckIn);
// One check-in per person per hangout (checked in again = same row, updated)
HangoutCheckInSchema.index({ hangoutId: 1, userId: 1 }, { unique: true });
HangoutCheckInSchema.index({ hangoutId: 1, createdAt: 1 });
