import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum TicketStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
}

/**
 * Money is collected outside the app (cash, the organizer's own Khalti/eSewa
 * QR, ...), so the organizer records it by hand. A payment gateway can later
 * drive the same states.
 */
export enum TicketPaymentStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
  // The ticket was cancelled after paying: the organizer owes the money back
  REFUND_OWED = 'refund_owed',
  REFUNDED = 'refunded',
}

export const TICKET_PAYMENT_METHODS = ['cash', 'khalti', 'esewa', 'bank', 'other'] as const;
export type TicketPaymentMethod = (typeof TICKET_PAYMENT_METHODS)[number];

// One attendee's ticket for a hangout. Issued when they become an attendee,
// cancelled when they leave or the hangout is cancelled.
@Schema({ timestamps: true })
export class HangoutTicket extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Hangout', required: true })
  hangoutId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  // What the QR code carries and the organizer scans/types at the door
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ enum: Object.values(TicketStatus), default: TicketStatus.ACTIVE })
  status: TicketStatus;

  @Prop()
  cancelledAt?: Date;

  @Prop({ type: String, enum: ['left', 'hangout_cancelled'] })
  cancelReason?: 'left' | 'hangout_cancelled';

  @Prop({ enum: Object.values(TicketPaymentStatus), default: TicketPaymentStatus.UNPAID })
  paymentStatus: TicketPaymentStatus;

  // Rupees received, recorded when the organizer marks the ticket paid
  @Prop({ min: 0 })
  amountPaid?: number;

  @Prop({ type: String, enum: TICKET_PAYMENT_METHODS })
  paymentMethod?: TicketPaymentMethod;

  @Prop()
  paidAt?: Date;

  @Prop()
  refundedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const HangoutTicketSchema = SchemaFactory.createForClass(HangoutTicket);
// One ticket per person per hangout (rejoining reactivates it)
HangoutTicketSchema.index({ hangoutId: 1, userId: 1 }, { unique: true });
HangoutTicketSchema.index({ userId: 1, status: 1 });
