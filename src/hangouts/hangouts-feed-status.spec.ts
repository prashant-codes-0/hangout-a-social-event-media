import { Types } from 'mongoose';
import { HangoutsService } from './hangouts.service';
import { HangoutStatus } from './schemas/hangout.schema';

const USER_ID = new Types.ObjectId().toString();
const OTHER_USER_ID = new Types.ObjectId().toString();

// Minimal chainable stand-in for the Mongoose query builder used by the feed.
function createQueryStub(docs: any[]) {
  const query: any = {};
  for (const method of ['populate', 'populate', 'populate', 'sort', 'select']) {
    query[method] = jest.fn().mockReturnValue(query);
  }
  query.exec = jest.fn().mockResolvedValue(docs);
  return query;
}

function createService(docs: any[]) {
  const query = createQueryStub(docs);
  const hangoutModel: any = {
    find: jest.fn().mockReturnValue(query),
    countDocuments: jest.fn().mockResolvedValue(0),
  };
  const service = new HangoutsService(
    hangoutModel as any,
    { findByIdAndUpdate: jest.fn(), find: jest.fn() } as any,
    {} as any,
    {} as any,
    { record: jest.fn(), remove: jest.fn() } as any, // activity log
    { friendsGoing: jest.fn().mockResolvedValue(new Map()) } as any, // nobody followed
    {} as any, // tickets
  );
  return { service, hangoutModel, query };
}

function createDoc(overrides: Record<string, any> = {}) {
  return {
    toObject: () => ({ _id: 'hangout1', status: HangoutStatus.UPCOMING, ...overrides }),
    blastedBy: [],
    requestedBy: [],
    // attendees come back as raw ObjectIds because the feed does not populate them
    attendees: [new Types.ObjectId(USER_ID)],
    ...overrides,
  };
}

describe('HangoutsService.findAll user status flags', () => {
  it('flags attendance for unpopulated attendees instead of throwing', async () => {
    const { service } = createService([createDoc()]);

    const [result] = await service.findAll({}, USER_ID);

    expect(result.userIsAttending).toBe(true);
    expect(result.userHasJoined).toBe(true);
  });

  it('handles populated attendee documents too', async () => {
    const { service } = createService([
      createDoc({ attendees: [{ _id: new Types.ObjectId(USER_ID), name: 'Test' }] }),
    ]);

    const [result] = await service.findAll({}, USER_ID);

    expect(result.userIsAttending).toBe(true);
  });

  it('reports false when the user is not an attendee', async () => {
    const { service } = createService([
      createDoc({ attendees: [new Types.ObjectId(OTHER_USER_ID)] }),
    ]);

    const [result] = await service.findAll({}, USER_ID);

    expect(result.userIsAttending).toBe(false);
    expect(result.userHasJoined).toBe(false);
  });

  it('does not throw when attendee collections are missing', async () => {
    const { service } = createService([createDoc({ attendees: undefined })]);

    const [result] = await service.findAll({}, USER_ID);

    expect(result.userIsAttending).toBe(false);
  });
});