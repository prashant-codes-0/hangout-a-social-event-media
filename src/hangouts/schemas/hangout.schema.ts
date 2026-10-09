import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  GeoJsonPoint,
  GeoJsonPointSchema,
  HangoutLocation,
  HangoutLocationSchema,
} from './hangout-location.schema';

export enum HangoutStatus {
  UPCOMING = 'upcoming',
  ONGOING = 'ongoing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// How long a hangout stays "ongoing" after its start time, when the organizer
// did not pick an explicit duration.
export const DEFAULT_DURATION_MINUTES = 120;

// Repeat cadence for a recurring hangout: the next occurrence is cloned
// automatically when the current one finishes.
export type HangoutRecurrenceFreq = 'daily' | 'weekly' | 'monthly';
export const HANGOUT_RECURRENCE_FREQS: HangoutRecurrenceFreq[] = ['daily', 'weekly', 'monthly'];

@Schema({ timestamps: true })
export class Hangout extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  purpose: string;

  @Prop({ required: true })
  place: string;

  // Optional map location (place/landmark or from → to route)
  @Prop({ type: HangoutLocationSchema })
  location?: HangoutLocation;

  // Copy of the location's meeting point for "near me" search. Kept in sync on create/update.
  @Prop({ type: GeoJsonPointSchema })
  geo?: GeoJsonPoint;

  // Free-form labels such as "hiking" or "board-games", lowercase
  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ required: true })
  time: Date;

  // How long the event runs, used to decide when "ongoing" becomes "completed"
  @Prop({ default: DEFAULT_DURATION_MINUTES, min: 15 })
  durationMinutes: number;

  // Lifecycle state. Derived from `time` + `durationMinutes` by the scheduler,
  // except for `cancelled` which only an organizer/admin can set.
  @Prop({
    enum: Object.values(HangoutStatus),
    default: HangoutStatus.UPCOMING,
  })
  status: HangoutStatus;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  cancelReason?: string;

  @Prop()
  completedAt?: Date;

  // The "how was it?" rating nudge only ever goes out once per completion
  @Prop({ default: false })
  ratingsNudged?: boolean;

  // Reminder windows already delivered, e.g. ['24h', '2h'].
  // Reset whenever the start time changes so the new time gets fresh reminders.
  @Prop({ type: [String], default: [] })
  remindersSent: string[];

  @Prop({ default: false })
  sponsored: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  sponsorId?: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  attendees: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  requestedBy: Types.ObjectId[];

  @Prop({ default: 0 })
  blasts: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  blastedBy: Types.ObjectId[];

  @Prop({ default: 10 })
  capacity: number;

  // Ticket price in rupees, paid to the organizer outside the app; 0 = free
  @Prop({ default: 0, min: 0 })
  price: number;

  @Prop({ default: true })
  isPublic: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  // Code attendees enter (or scan from the QR) to check in at the venue
  @Prop()
  checkInCode?: string;

  @Prop({ type: Date })
  checkInCodeExpiresAt?: Date;

  // Recurring series: when this hangout finishes, the next one is cloned
  @Prop({ enum: HANGOUT_RECURRENCE_FREQS })
  recurrence?: HangoutRecurrenceFreq;

  // Ensures the next occurrence is only ever created once
  @Prop({ default: false })
  seriesSpawned?: boolean;
}

export const HangoutSchema = SchemaFactory.createForClass(Hangout);

// Drives the "what is live right now" queries and the reminder scans.
HangoutSchema.index({ status: 1, time: 1 });
HangoutSchema.index({ time: 1, status: 1 });
HangoutSchema.index({ isPublic: 1, status: 1, time: 1 });

// "Near me" discovery and tag filters
HangoutSchema.index({ geo: '2dsphere' });
HangoutSchema.index({ tags: 1 });
