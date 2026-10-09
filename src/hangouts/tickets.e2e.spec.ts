import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import {
  MongooseModule,
  getConnectionToken,
  getModelToken,
} from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { HangoutsModule } from './hangouts.module';
import { HangoutsService } from './hangouts.service';
import { TicketsService } from './tickets.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../auth/schemas/user.schema';
import { Hangout, HangoutStatus } from './schemas/hangout.schema';
import {
  HangoutTicket,
  TicketPaymentStatus,
  TicketStatus,
} from './schemas/hangout-ticket.schema';

jest.setTimeout(60000);

const TEST_DB = 'mongodb://localhost:27017/hangout-tickets-e2e';
const STAMP = Date.now();

describe('hangout tickets', () => {
  let moduleRef: TestingModule;
  let hangouts: HangoutsService;
  let tickets: TicketsService;
  let users: Model<User>;
  let hangoutModel: Model<Hangout>;
  let ticketModel: Model<HangoutTicket>;

  let organizer: string;
  let alice: string;
  let bob: string;
  let carol: string;

  const makeUser = async (name: string) => {
    const user = await users.create({
      name,
      email: `${name.toLowerCase()}-${STAMP}@example.com`,
      passwordHash: 'x',
      verified: true,
    });
    return String(user._id);
  };

  // Starts in 30 minutes, so the check-in window (opens 2h before) is open
  const makeHangout = async (price = 500) => {
    const hangout = await hangouts.create(
      {
        title: 'Board game night',
        description: 'Bring snacks',
        purpose: 'Gaming',
        place: 'Cafe',
        time: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        capacity: 10,
        price,
      } as never,
      organizer,
    );
    return String(hangout._id);
  };

  const join = async (hangoutId: string, userId: string) => {
    await hangouts.requestToJoin(hangoutId, userId);
    await hangouts.handleJoinRequestNew(
      hangoutId,
      userId,
      'approve',
      organizer,
    );
  };

  const ticketOf = (hangoutId: string, userId: string) =>
    ticketModel
      .findOne({
        hangoutId: new Types.ObjectId(hangoutId),
        userId: new Types.ObjectId(userId),
      })
      .lean();

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRoot(TEST_DB),
        RealtimeModule,
        HangoutsModule,
      ],
    })
      .overrideProvider(NotificationsService)
      .useValue({ notify: () => undefined })
      .compile();

    hangouts = moduleRef.get(HangoutsService);
    tickets = moduleRef.get(TicketsService);
    users = moduleRef.get(getModelToken(User.name));
    hangoutModel = moduleRef.get(getModelToken(Hangout.name));
    ticketModel = moduleRef.get(getModelToken(HangoutTicket.name));

    organizer = await makeUser('Organizer');
    alice = await makeUser('Alice');
    bob = await makeUser('Bob');
    carol = await makeUser('Carol');
  });

  afterAll(async () => {
    try {
      await moduleRef.get<Connection>(getConnectionToken()).dropDatabase();
    } catch {
      /* the database may already be gone */
    }
    await moduleRef?.close();
  });

  it('issues a ticket when a join request is approved, but none for the organizer', async () => {
    const hangoutId = await makeHangout();
    await join(hangoutId, alice);

    const mine = await tickets.myTicket(hangoutId, alice);
    expect(mine.status).toBe(TicketStatus.ACTIVE);
    expect(mine.paymentStatus).toBe(TicketPaymentStatus.UNPAID);
    expect(mine.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(mine.hangout.price).toBe(500);

    await expect(tickets.myTicket(hangoutId, organizer)).rejects.toThrow(
      BadRequestException,
    );
    await expect(tickets.myTicket(hangoutId, bob)).rejects.toThrow(
      "You don't have a ticket",
    );
  });

  it('lets only the organizer see the dashboard', async () => {
    const hangoutId = await makeHangout();
    await expect(
      tickets.organizerView(hangoutId, alice, false),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      tickets.organizerView(hangoutId, alice, true),
    ).resolves.toBeDefined(); // admin
  });

  it('records payments by hand and totals them', async () => {
    const hangoutId = await makeHangout();
    await join(hangoutId, alice);
    await join(hangoutId, bob);
    const ticket = await ticketOf(hangoutId, alice);

    const paid = await tickets.updatePayment(
      hangoutId,
      String(ticket!._id),
      { status: TicketPaymentStatus.PAID, method: 'khalti' },
      organizer,
      false,
    );
    expect(paid.amountPaid).toBe(500);
    expect(paid.paymentMethod).toBe('khalti');

    await expect(
      tickets.updatePayment(
        hangoutId,
        String(ticket!._id),
        { status: TicketPaymentStatus.PAID },
        organizer,
        false,
      ),
    ).rejects.toThrow('Only an unpaid, active ticket');

    const { summary } = await tickets.organizerView(
      hangoutId,
      organizer,
      false,
    );
    expect(summary).toMatchObject({
      issued: 2,
      paid: 1,
      unpaid: 1,
      collected: 500,
      outstanding: 500,
      net: 500,
    });
  });

  it('checks people in by ticket code, once', async () => {
    const hangoutId = await makeHangout();
    await join(hangoutId, alice);
    const { code } = await tickets.myTicket(hangoutId, alice);

    // Typed loosely: lower case, no dash
    const first = await tickets.checkInByCode(
      hangoutId,
      code.toLowerCase().replace('-', ''),
      organizer,
      false,
    );
    expect(first.alreadyCheckedIn).toBe(false);
    expect(first.ticket.user.name).toBe('Alice');
    expect(first.ticket.paymentStatus).toBe(TicketPaymentStatus.UNPAID);

    const again = await tickets.checkInByCode(
      hangoutId,
      code,
      organizer,
      false,
    );
    expect(again.alreadyCheckedIn).toBe(true);

    await expect(
      tickets.checkInByCode(hangoutId, 'AAAA-AAAA', organizer, false),
    ).rejects.toThrow('No ticket with that code');
    // A ticket only works for its own hangout
    const other = await makeHangout();
    await expect(
      tickets.checkInByCode(other, code, organizer, false),
    ).rejects.toThrow('No ticket with that code');
    // Attendees can't check others in
    await expect(
      tickets.checkInByCode(hangoutId, code, alice, false),
    ).rejects.toThrow(ForbiddenException);

    const { summary } = await tickets.organizerView(
      hangoutId,
      organizer,
      false,
    );
    expect(summary.checkedIn).toBe(1);
  });

  it('cancels the ticket on leaving, owes a refund if paid, and reactivates on rejoining', async () => {
    const hangoutId = await makeHangout();
    await join(hangoutId, alice);
    const ticket = await ticketOf(hangoutId, alice);
    await tickets.updatePayment(
      hangoutId,
      String(ticket!._id),
      { status: TicketPaymentStatus.PAID },
      organizer,
      false,
    );

    await hangouts.leaveHangout(hangoutId, alice);
    const left = await ticketOf(hangoutId, alice);
    expect(left!.status).toBe(TicketStatus.CANCELLED);
    expect(left!.paymentStatus).toBe(TicketPaymentStatus.REFUND_OWED);
    await expect(
      tickets.checkInByCode(hangoutId, left!.code, organizer, false),
    ).rejects.toThrow('was cancelled');

    let { summary } = await tickets.organizerView(hangoutId, organizer, false);
    expect(summary).toMatchObject({
      issued: 0,
      cancelled: 1,
      refundsOwed: 1,
      refundsOwedAmount: 500,
    });

    await tickets.updatePayment(
      hangoutId,
      String(ticket!._id),
      { status: TicketPaymentStatus.REFUNDED },
      organizer,
      false,
    );
    ({ summary } = await tickets.organizerView(hangoutId, organizer, false));
    expect(summary).toMatchObject({
      refundsOwed: 0,
      collected: 500,
      refunded: 500,
      net: 0,
    });

    // Rejoining brings the same ticket back, unpaid since the money went back
    await join(hangoutId, alice);
    const back = await ticketOf(hangoutId, alice);
    expect(back!.code).toBe(left!.code);
    expect(back!.status).toBe(TicketStatus.ACTIVE);
    expect(back!.paymentStatus).toBe(TicketPaymentStatus.UNPAID);
  });

  it('voids tickets when the hangout is cancelled and restores them with it', async () => {
    const hangoutId = await makeHangout();
    await join(hangoutId, bob);

    await hangouts.setStatus(
      hangoutId,
      { status: HangoutStatus.CANCELLED } as never,
      organizer,
    );
    expect((await ticketOf(hangoutId, bob))!.status).toBe(
      TicketStatus.CANCELLED,
    );

    await hangouts.setStatus(
      hangoutId,
      { status: HangoutStatus.UPCOMING } as never,
      organizer,
    );
    expect((await ticketOf(hangoutId, bob))!.status).toBe(TicketStatus.ACTIVE);
  });

  it('gives attendees from before tickets existed a ticket on first look', async () => {
    const hangoutId = await makeHangout(0);
    await hangoutModel.updateOne(
      { _id: hangoutId },
      { $push: { attendees: new Types.ObjectId(carol) } },
    );
    expect(await ticketOf(hangoutId, carol)).toBeNull();

    const list = await tickets.myTickets(carol);
    expect(list.map((t) => String(t.hangout._id))).toContain(hangoutId);
    expect(
      list.find((t) => String(t.hangout._id) === hangoutId)!.hangout.price,
    ).toBe(0);
  });

  it('deletes tickets with the hangout', async () => {
    const hangoutId = await makeHangout();
    await join(hangoutId, alice);
    await hangouts.remove(hangoutId, organizer);
    expect(
      await ticketModel.countDocuments({
        hangoutId: new Types.ObjectId(hangoutId),
      }),
    ).toBe(0);
  });
});
