import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import {
  MongooseModule,
  getConnectionToken,
  getModelToken,
} from '@nestjs/mongoose';
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Connection, Model, Types } from 'mongoose';
import { AuthModule } from './auth.module';
import { AccountService, DELETED_USER_EMAIL } from './account/account.service';
import { User } from './schemas/user.schema';
import { Message } from '../chat/schemas/message.schema';
import {
  Notification,
  NotificationType,
} from '../notifications/schemas/notification.schema';
import { RealtimeModule } from '../realtime/realtime.module';
import { EmailService } from '../common/services/email.service';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';

jest.setTimeout(60000);

const TEST_DB = 'mongodb://localhost:27017/hangout-account-e2e';
const STAMP = Date.now();
const EMAIL = `account-e2e-${STAMP}@example.com`;
const PASSWORD = 'CorrectHorse1';

interface DeletionMail {
  to: string;
  cancelUrl: string;
}

interface HttpBody {
  success: boolean;
  statusCode: number;
  message: string;
  data?: Record<string, unknown>;
}

describe('account deletion & export over HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;
  let deletionMails: DeletionMail[];

  const post = async (path: string, body: unknown, token?: string) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as HttpBody };
  };

  const get = async (path: string, token?: string) => {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res;
  };

  const signIn = async () => {
    const res = await post('/auth/signin', {
      email: EMAIL,
      password: PASSWORD,
    });
    return res.body.data?.['access_token'] as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRoot(TEST_DB),
        RealtimeModule,
        AuthModule,
      ],
    })
      .overrideProvider(EmailService)
      .useValue({
        onModuleInit: () => undefined,
        sendWelcomeEmail: () => undefined,
        sendOTPEmail: () => undefined,
        sendPasswordResetEmail: () => undefined,
        sendAccountDeletionCancelledEmail: () => undefined,
        sendAccountDeletionScheduledEmail: (
          to: string,
          _name: string,
          cancelUrl: string,
        ) => {
          deletionMails.push({ to, cancelUrl });
        },
      })
      .compile();

    deletionMails = [];

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();

    const users = app.get<Model<User>>(getModelToken(User.name));
    await users.deleteMany({ email: EMAIL });
    await users.create({
      name: 'Account E2E',
      email: EMAIL,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
    });
  });

  afterAll(async () => {
    const connection = app.get<Connection>(getConnectionToken());
    try {
      await connection.dropDatabase();
    } catch {
      /* the database may already be gone */
    }
    await app?.close();
  });

  it('refuses the export without a session', async () => {
    const res = await get('/auth/account/export');
    expect(res.status).toBe(401);
  });

  it('exports the account data as a JSON attachment, without secrets', async () => {
    const token = await signIn();
    const res = await get('/auth/account/export', token);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('content-disposition')).toContain('attachment');

    const raw = await res.text();
    const data = JSON.parse(raw) as Record<string, any>;
    expect(data.schemaVersion).toBe(1);
    expect((data.account as { email: string }).email).toBe(EMAIL);

    // No authentication material may ever leave the server.
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('twoFactorSecret');
    expect(raw).not.toContain('deletionCancelToken');
  });

  it('requires the exact DELETE confirmation phrase', async () => {
    const token = await signIn();
    const res = await post(
      '/auth/account/deletion-request',
      { password: PASSWORD, confirmation: 'delete' },
      token,
    );
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects the wrong password', async () => {
    const token = await signIn();
    const res = await post(
      '/auth/account/deletion-request',
      { password: 'WrongPass9', confirmation: 'DELETE' },
      token,
    );
    expect(res.status).toBe(401);
  });

  it('schedules deletion, emails only the hashed token, and blocks sign-in', async () => {
    const token = await signIn();
    const res = await post(
      '/auth/account/deletion-request',
      { password: PASSWORD, confirmation: 'DELETE' },
      token,
    );
    expect(res.status).toBe(201);
    expect(res.body.data?.['scheduledFor']).toBeDefined();

    // A cancellation mail went out carrying a token, but only its hash is stored.
    expect(deletionMails).toHaveLength(1);
    expect(deletionMails[0].to).toBe(EMAIL);
    const cancelToken = new URL(deletionMails[0].cancelUrl).searchParams.get(
      'token',
    )!;
    expect(cancelToken).toMatch(/^[0-9a-f]{64}$/);

    const user = await app
      .get<Model<User>>(getModelToken(User.name))
      .findOne({ email: EMAIL })
      .lean();
    expect(user?.deletionScheduledFor?.getTime()).toBeGreaterThan(Date.now());
    expect(user?.deletionCancelToken).toBe(
      createHash('sha256').update(cancelToken).digest('hex'),
    );

    // The deactivated account can no longer sign in.
    const blocked = await post('/auth/signin', {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(blocked.status).toBe(401);
  });

  it('ignores an invalid cancellation token', async () => {
    const res = await post('/auth/account/cancel-deletion', {
      token: 'f'.repeat(64),
    });
    expect(res.status).toBe(400);
  });

  it('restores the account with the emailed token and allows sign-in again', async () => {
    const cancelToken = new URL(deletionMails[0].cancelUrl).searchParams.get(
      'token',
    )!;
    const res = await post('/auth/account/cancel-deletion', {
      token: cancelToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const user = await app
      .get<Model<User>>(getModelToken(User.name))
      .findOne({ email: EMAIL })
      .lean();
    expect(user?.deletionScheduledFor).toBeUndefined();
    expect(user?.deletionCancelToken).toBeUndefined();

    const token = await signIn();
    expect(token).toBeDefined();
  });

  it('purges a due account, anonymizing shared content as "Deleted user"', async () => {
    const account = app.get(AccountService);
    const users = app.get<Model<User>>(getModelToken(User.name));
    const messages = app.get<Model<Message>>(getModelToken(Message.name));
    const notifications = app.get<Model<Notification>>(
      getModelToken(Notification.name),
    );

    const victim = await users.create({
      name: 'Purge Victim',
      email: `purge-${STAMP}@example.com`,
      passwordHash: await bcrypt.hash('Passw0rd!', 10),
      deletionScheduledFor: new Date(Date.now() - 1000),
    });

    const hangoutId = new Types.ObjectId();
    await messages.create({
      hangoutId,
      userId: victim._id,
      content: 'see you there',
    });
    await notifications.create({
      userId: victim._id,
      type: NotificationType.GROUP_MESSAGE,
      title: 'New message',
      link: '/x',
    });

    const purged = await account.purgeAccount(String(victim._id));
    expect(purged).toBe(true);

    // The account is gone, but a shared stand-in exists.
    expect(await users.findById(victim._id).lean()).toBeNull();
    const ghost = await users.findOne({ email: DELETED_USER_EMAIL }).lean();
    expect(ghost?.name).toBe('Deleted user');

    // Shared content survives, re-pointed at the stand-in.
    const message = await messages.findOne({ hangoutId }).lean();
    expect(message?.content).toBe('see you there');
    expect(String(message?.userId)).toBe(String(ghost?._id as Types.ObjectId));

    // Private content is erased.
    expect(await notifications.countDocuments({ userId: victim._id })).toBe(0);

    // Purging twice is a no-op.
    expect(await account.purgeAccount(String(victim._id))).toBe(false);
  });
});
