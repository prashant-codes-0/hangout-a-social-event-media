import * as webpush from 'web-push';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { NotificationType } from './schemas/notification.schema';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

const sendNotification = webpush.sendNotification as jest.Mock;
const USER_ID = 'b00000000000000000000002';

function createPushService(
  subscriptions: { endpoint: string; keys: object }[],
  env: Record<string, string> = {
    VAPID_PUBLIC_KEY: 'pub',
    VAPID_PRIVATE_KEY: 'priv',
  },
) {
  const model = {
    find: jest.fn(() => ({
      lean: () => ({ exec: () => Promise.resolve(subscriptions) }),
    })),
    deleteMany: jest.fn(() => Promise.resolve({ deletedCount: 1 })),
    updateMany: jest.fn(() => Promise.resolve({})),
  };
  const config = { get: (key: string) => env[key] };
  const service = new PushService(model as any, config as any);
  return { service, model };
}

const payload = {
  id: 'n1',
  type: 'private_message',
  title: 'Bikash',
  body: 'hi',
  link: '/hangouts',
  tag: 'chat_1',
};

describe('PushService', () => {
  beforeEach(() => sendNotification.mockReset());

  it('is off without VAPID keys and sends nothing', async () => {
    const { service, model } = createPushService([], {});
    expect(service.config()).toEqual({ enabled: false, publicKey: null });
    expect(await service.sendToUser(USER_ID, payload)).toEqual({ sent: 0 });
    expect(model.find).not.toHaveBeenCalled();
  });

  it('sends to every browser of the user', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const { service, model } = createPushService([
      { endpoint: 'https://push/a', keys: {} },
      { endpoint: 'https://push/b', keys: {} },
    ]);

    expect(await service.sendToUser(USER_ID, payload)).toEqual({
      sent: 2,
      removed: 0,
    });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [, body, options] = sendNotification.mock.calls[0];
    expect(JSON.parse(body)).toEqual(payload);
    expect(options).toMatchObject({ urgency: 'high', topic: 'chat_1' });
    expect(model.updateMany).toHaveBeenCalled();
  });

  it('removes subscriptions the push service says are gone (404/410)', async () => {
    sendNotification
      .mockRejectedValueOnce(
        Object.assign(new Error('Gone'), { statusCode: 410 }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('Not found'), { statusCode: 404 }),
      )
      .mockResolvedValueOnce({ statusCode: 201 });
    const { service, model } = createPushService([
      { endpoint: 'https://push/gone', keys: {} },
      { endpoint: 'https://push/missing', keys: {} },
      { endpoint: 'https://push/ok', keys: {} },
    ]);

    expect(await service.sendToUser(USER_ID, payload)).toEqual({
      sent: 1,
      removed: 2,
    });
    expect(model.deleteMany).toHaveBeenCalledWith({
      endpoint: { $in: ['https://push/gone', 'https://push/missing'] },
    });
  });

  it('keeps the subscription and does not throw on other errors', async () => {
    sendNotification.mockRejectedValue(
      Object.assign(new Error('Server error'), { statusCode: 500 }),
    );
    const { service, model } = createPushService([
      { endpoint: 'https://push/a', keys: {} },
    ]);

    await expect(service.sendToUser(USER_ID, payload)).resolves.toEqual({
      sent: 0,
      removed: 0,
    });
    expect(model.deleteMany).not.toHaveBeenCalled();
  });
});

describe('NotificationsService Web Push', () => {
  function setup(online: boolean, notification: Record<string, unknown>) {
    const doc = {
      _id: { toString: () => 'n1' },
      userId: { toString: () => USER_ID },
      count: 1,
      body: 'latest text',
      title: 'Bikash',
      link: '/x',
      populate: jest.fn(() => Promise.resolve()),
      toJSON: () => ({}),
      ...notification,
    };
    const model = { create: jest.fn(() => Promise.resolve(doc)) };
    const realtime = {
      emitToUser: jest.fn(),
      isUserOnline: jest.fn(() => Promise.resolve(online)),
    };
    const push = {
      isEnabled: () => true,
      sendToUser: jest.fn(() => Promise.resolve({ sent: 1 })),
    };
    const service = new NotificationsService(
      model as any,
      realtime as any,
      push as any,
    );
    return { service, push, realtime };
  }
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('does not push while the user has the app open', async () => {
    const { service, push, realtime } = setup(true, {
      type: NotificationType.JOIN_REQUEST,
    });
    await service.notify(USER_ID, {
      type: NotificationType.JOIN_REQUEST,
      title: 't',
      link: '/x',
    });
    await flush();
    expect(realtime.emitToUser).toHaveBeenCalled();
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('pushes when the user is away, tagged by the alert id', async () => {
    const { service, push } = setup(false, {
      type: NotificationType.JOIN_REQUEST,
    });
    await service.notify(USER_ID, {
      type: NotificationType.JOIN_REQUEST,
      title: 't',
      link: '/x',
    });
    await flush();
    expect(push.sendToUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ tag: 'n1', body: 'latest text' }),
    );
  });

  it('groups message pushes per conversation with a count', async () => {
    const { service, push } = setup(false, {
      type: NotificationType.PRIVATE_MESSAGE,
      chatId: { toString: () => 'c1' },
      count: 3,
    });
    await service.notify(USER_ID, {
      type: NotificationType.PRIVATE_MESSAGE,
      title: 't',
      link: '/x',
    });
    await flush();
    expect(push.sendToUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        tag: 'chat_c1',
        count: 3,
        body: '3 new messages · latest text',
      }),
    );
  });

  it('a chat request keeps its own tag (not the conversation tag)', async () => {
    const { service, push } = setup(false, {
      type: NotificationType.CHAT_REQUEST,
      chatId: { toString: () => 'c1' },
    });
    await service.notify(USER_ID, {
      type: NotificationType.CHAT_REQUEST,
      title: 't',
      link: '/x',
    });
    await flush();
    expect(push.sendToUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ tag: 'n1' }),
    );
  });

  it('group messages share the hangout tag', async () => {
    const { service, push } = setup(false, {
      type: NotificationType.GROUP_MESSAGE,
      hangoutId: { toString: () => 'h1' },
    });
    await service.notify(USER_ID, {
      type: NotificationType.GROUP_MESSAGE,
      title: 't',
      link: '/x',
    });
    await flush();
    expect(push.sendToUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ tag: 'hangout_h1' }),
    );
  });
});
