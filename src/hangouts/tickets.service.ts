import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { Hangout, HangoutStatus } from './schemas/hangout.schema';
import { HangoutCheckIn } from './schemas/hangout-checkin.schema';
import {
  HangoutTicket,
  TicketPaymentStatus,
  TicketStatus,
} from './schemas/hangout-ticket.schema';
import { UpdateTicketPaymentDto } from './dto/ticket.dto';
import { CheckInService } from './checkin.service';

// Same unambiguous alphabet as check-in codes (no 0/O/1/I/L)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** "k7mp-q2xa " → "K7MPQ2XA", so a ticket code can be typed loosely. */
export const normalizeTicketCode = (code: string) =>
  code.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** "K7MPQ2XA" → "K7MP-Q2XA", easier to read out at the door. */
export const formatTicketCode = (code: string) =>
  `${code.slice(0, 4)}-${code.slice(4)}`;

type PopulatedUser = { _id: Types.ObjectId; name?: string; email?: string };

// Tickets for hangout attendees: issued on joining, scanned at the door,
// with payments the organizer records by hand (no gateway yet).
@Injectable()
export class TicketsService {
  constructor(
    @InjectModel(Hangout.name) private hangoutModel: Model<Hangout>,
    @InjectModel(HangoutTicket.name) private ticketModel: Model<HangoutTicket>,
    @InjectModel(HangoutCheckIn.name)
    private checkInModel: Model<HangoutCheckIn>,
    private checkIns: CheckInService,
  ) {}

  // ---- Lifecycle (called by HangoutsService as attendees come and go) ----

  /** Gives the attendee a ticket, or reactivates the one they had before leaving. */
  async issue(
    hangoutId: Types.ObjectId | string,
    userId: Types.ObjectId | string,
  ): Promise<HangoutTicket> {
    const filter = {
      hangoutId: new Types.ObjectId(String(hangoutId)),
      userId: new Types.ObjectId(String(userId)),
    };
    const existing = await this.ticketModel.findOne(filter);
    if (existing) {
      if (existing.status === TicketStatus.CANCELLED) {
        existing.status = TicketStatus.ACTIVE;
        existing.cancelledAt = undefined;
        existing.cancelReason = undefined;
        // Money not yet handed back still counts for the returning attendee
        if (existing.paymentStatus === TicketPaymentStatus.REFUND_OWED) {
          existing.paymentStatus = TicketPaymentStatus.PAID;
        } else if (existing.paymentStatus === TicketPaymentStatus.REFUNDED) {
          existing.paymentStatus = TicketPaymentStatus.UNPAID;
          existing.amountPaid = undefined;
          existing.paymentMethod = undefined;
          existing.paidAt = undefined;
          existing.refundedAt = undefined;
        }
        await existing.save();
      }
      return existing;
    }

    for (let attempt = 0; ; attempt++) {
      try {
        return await this.ticketModel.create({
          ...filter,
          code: this.generateCode(),
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000 || attempt >= 4)
          throw error;
        // A duplicate key is either a code clash (retry) or a parallel issue for the same person
        const raced = await this.ticketModel.findOne(filter);
        if (raced) return raced;
      }
    }
  }

  /** Tickets for every attendee except the organizer (who needs none). Skips ones that exist. */
  async issueForAttendees(
    hangout: Pick<Hangout, '_id' | 'attendees' | 'createdBy'>,
  ) {
    const organizer = String(hangout.createdBy);
    for (const attendee of hangout.attendees ?? []) {
      if (String(attendee) !== organizer)
        await this.issue(hangout._id as Types.ObjectId, attendee);
    }
  }

  /** The attendee left: their spot is free again, and paid money becomes a refund owed. */
  async cancel(
    hangoutId: Types.ObjectId | string,
    userId: Types.ObjectId | string,
  ) {
    await this.cancelWhere(
      {
        hangoutId: new Types.ObjectId(String(hangoutId)),
        userId: new Types.ObjectId(String(userId)),
      },
      'left',
    );
  }

  async cancelAllForHangout(hangoutId: Types.ObjectId | string) {
    await this.cancelWhere(
      { hangoutId: new Types.ObjectId(String(hangoutId)) },
      'hangout_cancelled',
    );
  }

  async deleteForHangout(hangoutId: Types.ObjectId | string) {
    await this.ticketModel.deleteMany({
      hangoutId: new Types.ObjectId(String(hangoutId)),
    });
  }

  private async cancelWhere(
    filter: Record<string, unknown>,
    reason: 'left' | 'hangout_cancelled',
  ) {
    const active = { ...filter, status: TicketStatus.ACTIVE };
    const cancelled = {
      status: TicketStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelReason: reason,
    };
    await this.ticketModel.updateMany(
      { ...active, paymentStatus: TicketPaymentStatus.PAID },
      {
        $set: { ...cancelled, paymentStatus: TicketPaymentStatus.REFUND_OWED },
      },
    );
    await this.ticketModel.updateMany(active, { $set: cancelled });
  }

  // ---- Attendee ----

  /** My ticket for one hangout (issued on the spot for attendees from before tickets existed). */
  async myTicket(hangoutId: string, userId: string) {
    const hangout = await this.requireHangout(hangoutId);
    if (String(hangout.createdBy) === userId) {
      throw new BadRequestException(
        "You're the organizer, so you don't need a ticket",
      );
    }
    const isAttendee = hangout.attendees.some((id) => String(id) === userId);
    let ticket: HangoutTicket | null = await this.ticketModel.findOne({
      hangoutId: hangout._id,
      userId: new Types.ObjectId(userId),
    });
    if (!ticket && isAttendee && hangout.status !== HangoutStatus.CANCELLED) {
      ticket = await this.issue(hangout._id as Types.ObjectId, userId);
    }
    if (!ticket)
      throw new NotFoundException("You don't have a ticket for this hangout");

    const checkIn = await this.checkInModel
      .findOne({ hangoutId: hangout._id, userId: new Types.ObjectId(userId) })
      .lean();
    return this.attendeeView(ticket, hangout, checkIn?.createdAt);
  }

  /** All my active tickets, soonest hangout first. */
  async myTickets(userId: string) {
    const uid = new Types.ObjectId(userId);
    // Backfill tickets for hangouts joined before tickets existed
    const joined = await this.hangoutModel
      .find({
        attendees: uid,
        createdBy: { $ne: uid },
        status: { $ne: HangoutStatus.CANCELLED },
      })
      .select('_id attendees createdBy')
      .lean();
    const have = new Set(
      (
        await this.ticketModel.find({ userId: uid }).select('hangoutId').lean()
      ).map((t) => String(t.hangoutId)),
    );
    for (const h of joined) {
      if (!have.has(String(h._id)))
        await this.issue(h._id as Types.ObjectId, uid);
    }

    const tickets = await this.ticketModel.find({
      userId: uid,
      status: TicketStatus.ACTIVE,
    });
    const hangouts = await this.hangoutModel
      .find({ _id: { $in: tickets.map((t) => t.hangoutId) } })
      .select('title time place status price durationMinutes')
      .lean();
    const byId = new Map(hangouts.map((h) => [String(h._id), h]));
    const checkIns = await this.checkInModel
      .find({
        userId: uid,
        hangoutId: { $in: tickets.map((t) => t.hangoutId) },
      })
      .lean();
    const checkedIn = new Map(
      checkIns.map((c) => [String(c.hangoutId), c.createdAt]),
    );

    return tickets
      .filter((t) => byId.has(String(t.hangoutId)))
      .map((t) =>
        this.attendeeView(
          t,
          byId.get(String(t.hangoutId))!,
          checkedIn.get(String(t.hangoutId)),
        ),
      )
      .sort(
        (a, b) =>
          new Date(a.hangout.time).getTime() -
          new Date(b.hangout.time).getTime(),
      );
  }

  private attendeeView(
    ticket: HangoutTicket,
    hangout: Pick<
      Hangout,
      '_id' | 'title' | 'time' | 'place' | 'status' | 'price'
    >,
    checkedInAt?: Date,
  ) {
    return {
      _id: ticket._id,
      code: formatTicketCode(ticket.code),
      status: ticket.status,
      paymentStatus: ticket.paymentStatus,
      amountPaid: ticket.amountPaid,
      paymentMethod: ticket.paymentMethod,
      checkedInAt: checkedInAt ?? null,
      hangout: {
        _id: hangout._id,
        title: hangout.title,
        time: hangout.time,
        place: hangout.place,
        status: hangout.status,
        price: hangout.price ?? 0,
      },
    };
  }

  // ---- Organizer ----

  /** Every ticket for the hangout, plus the headline numbers for the organizer dashboard. */
  async organizerView(hangoutId: string, userId: string, isAdmin: boolean) {
    const hangout = await this.requireOrganizer(hangoutId, userId, isAdmin);
    if (hangout.status !== HangoutStatus.CANCELLED)
      await this.issueForAttendees(hangout);

    const [tickets, checkIns] = await Promise.all([
      this.ticketModel
        .find({ hangoutId: hangout._id })
        .populate<{ userId: PopulatedUser }>('userId', 'name email')
        .lean(),
      this.checkInModel.find({ hangoutId: hangout._id }).lean(),
    ]);
    const checkedIn = new Map(
      checkIns.map((c) => [String(c.userId), c.createdAt]),
    );
    const price = hangout.price ?? 0;

    const rows = tickets
      .map((t) => ({
        _id: t._id,
        code: formatTicketCode(t.code),
        status: t.status,
        cancelReason: t.cancelReason,
        cancelledAt: t.cancelledAt,
        paymentStatus: t.paymentStatus,
        amountPaid: t.amountPaid,
        paymentMethod: t.paymentMethod,
        paidAt: t.paidAt,
        refundedAt: t.refundedAt,
        checkedInAt: checkedIn.get(String(t.userId?._id)) ?? null,
        user: {
          _id: t.userId?._id,
          name: t.userId?.name ?? 'Unknown',
          email: t.userId?.email,
        },
        issuedAt: t.createdAt,
      }))
      .sort((a, b) => a.user.name.localeCompare(b.user.name));

    const active = rows.filter((r) => r.status === TicketStatus.ACTIVE);
    const sum = (list: typeof rows) =>
      list.reduce((total, r) => total + (r.amountPaid ?? 0), 0);
    const withStatus = (status: TicketPaymentStatus) =>
      rows.filter((r) => r.paymentStatus === status);
    const collected = sum(
      rows.filter((r) => r.paymentStatus !== TicketPaymentStatus.UNPAID),
    );
    const refunded = sum(withStatus(TicketPaymentStatus.REFUNDED));
    const unpaidActive = active.filter(
      (r) => r.paymentStatus === TicketPaymentStatus.UNPAID,
    );

    return {
      hangout: {
        _id: hangout._id,
        title: hangout.title,
        time: hangout.time,
        place: hangout.place,
        status: hangout.status,
        price,
        capacity: hangout.capacity,
      },
      summary: {
        issued: active.length,
        cancelled: rows.length - active.length,
        checkedIn: active.filter((r) => r.checkedInAt).length,
        paid: active.filter((r) => r.paymentStatus === TicketPaymentStatus.PAID)
          .length,
        unpaid: unpaidActive.length,
        // Rupees: everything received, what's still due, and what goes back
        collected,
        outstanding: price * unpaidActive.length,
        refundsOwed: withStatus(TicketPaymentStatus.REFUND_OWED).length,
        refundsOwedAmount: sum(withStatus(TicketPaymentStatus.REFUND_OWED)),
        refunded,
        net: collected - refunded,
      },
      tickets: rows,
    };
  }

  /** The organizer scanned or typed a ticket code at the door. */
  async checkInByCode(
    hangoutId: string,
    code: string,
    userId: string,
    isAdmin: boolean,
  ) {
    const hangout = await this.requireOrganizer(hangoutId, userId, isAdmin);
    if (hangout.status === HangoutStatus.CANCELLED) {
      throw new BadRequestException('This hangout was cancelled');
    }
    const ticket = await this.ticketModel
      .findOne({ code: normalizeTicketCode(code), hangoutId: hangout._id })
      .populate<{ userId: PopulatedUser }>('userId', 'name email');
    if (!ticket)
      throw new BadRequestException(
        'No ticket with that code for this hangout',
      );
    if (ticket.status !== TicketStatus.ACTIVE) {
      throw new BadRequestException(
        `${ticket.userId?.name ?? 'This person'}'s ticket was cancelled`,
      );
    }

    const result = await this.checkIns.checkInWithTicket(
      hangout,
      String(ticket.userId._id),
    );
    return {
      ...result,
      ticket: {
        _id: ticket._id,
        code: formatTicketCode(ticket.code),
        paymentStatus: ticket.paymentStatus,
        user: {
          _id: ticket.userId._id,
          name: ticket.userId.name,
          email: ticket.userId.email,
        },
      },
      price: hangout.price ?? 0,
    };
  }

  /** The organizer records a payment by hand (cash, their own Khalti/eSewa QR, ...). */
  async updatePayment(
    hangoutId: string,
    ticketId: string,
    dto: UpdateTicketPaymentDto,
    userId: string,
    isAdmin: boolean,
  ) {
    const hangout = await this.requireOrganizer(hangoutId, userId, isAdmin);
    if (!Types.ObjectId.isValid(ticketId))
      throw new NotFoundException('Ticket not found');
    const ticket = await this.ticketModel.findOne({
      _id: ticketId,
      hangoutId: hangout._id,
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const active = ticket.status === TicketStatus.ACTIVE;
    switch (dto.status) {
      case TicketPaymentStatus.PAID:
        if (!active || ticket.paymentStatus !== TicketPaymentStatus.UNPAID) {
          throw new BadRequestException(
            'Only an unpaid, active ticket can be marked paid',
          );
        }
        ticket.paymentStatus = TicketPaymentStatus.PAID;
        ticket.amountPaid = dto.amount ?? hangout.price ?? 0;
        ticket.paymentMethod = dto.method ?? 'cash';
        ticket.paidAt = new Date();
        break;
      case TicketPaymentStatus.UNPAID:
        if (!active || ticket.paymentStatus !== TicketPaymentStatus.PAID) {
          throw new BadRequestException(
            'Only a paid, active ticket can be marked unpaid',
          );
        }
        ticket.paymentStatus = TicketPaymentStatus.UNPAID;
        ticket.amountPaid = undefined;
        ticket.paymentMethod = undefined;
        ticket.paidAt = undefined;
        break;
      case TicketPaymentStatus.REFUNDED:
        if (ticket.paymentStatus !== TicketPaymentStatus.REFUND_OWED) {
          throw new BadRequestException(
            'Only a cancelled ticket that was paid for can be marked refunded',
          );
        }
        ticket.paymentStatus = TicketPaymentStatus.REFUNDED;
        ticket.refundedAt = new Date();
        break;
    }
    await ticket.save();
    return {
      _id: ticket._id,
      paymentStatus: ticket.paymentStatus,
      amountPaid: ticket.amountPaid,
      paymentMethod: ticket.paymentMethod,
      paidAt: ticket.paidAt,
      refundedAt: ticket.refundedAt,
    };
  }

  // ---- Helpers ----

  private async requireHangout(hangoutId: string): Promise<Hangout> {
    if (!Types.ObjectId.isValid(hangoutId))
      throw new NotFoundException('Hangout not found');
    const hangout = await this.hangoutModel.findById(hangoutId);
    if (!hangout) throw new NotFoundException('Hangout not found');
    return hangout;
  }

  private async requireOrganizer(
    hangoutId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<Hangout> {
    const hangout = await this.requireHangout(hangoutId);
    if (!isAdmin && String(hangout.createdBy) !== userId) {
      throw new ForbiddenException(
        'Only the hangout organizer can manage tickets',
      );
    }
    return hangout;
  }

  private generateCode(): string {
    const bytes = randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++)
      code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return code;
  }
}
