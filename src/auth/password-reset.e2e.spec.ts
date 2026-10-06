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
import { Connection, Model } from 'mongoose';
import { AuthModule } from './auth.module';
import { User } from './schemas/user.schema';
import { EmailService } from '../common/services/email.service';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';

jest.setTimeout(60000);

const TEST_DB = 'mongodb://localhost:27017/hangout-auth-e2e';
const STAMP = Date.now();
const EMAIL = `reset-e2e-${STAMP}@example.com`;
const OLD_PASSWORD = 'OldPass123';
const NEW_PASSWORD = 'NewPass456';

interface MailCall {
  to: string;
  url: string;
}

interface HttpBody {
  success: boolean;
  statusCode: number;
  message: string;
  data?: Record<string, unknown>;
}

describe('password reset over HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;
  let mails: MailCall[];

  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as HttpBody };
  };

  const lastMail = () => mails[mails.length - 1];

  const tokenFromMail = () =>
    new URL(lastMail().url).searchParams.get('token')!;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRoot(TEST_DB),
        AuthModule,
      ],
    })
      .overrideProvider(EmailService)
      .useValue({
        onModuleInit: () => undefined,
        sendWelcomeEmail: () => undefined,
        sendOTPEmail: () => undefined,
        sendPasswordResetEmail: (to: string, _name: string, url: string) => {
          mails.push({ to, url });
        },
      })
      .compile();

    mails = [];

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
      name: 'Reset E2E',
      email: EMAIL,
      passwordHash: await bcrypt.hash(OLD_PASSWORD, 10),
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

  it('rejects a malformed email', async () => {
    const res = await post('/auth/forgot-password', { email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mails).toHaveLength(0);
  });

  it('rejects fields the endpoint does not know about', async () => {
    const res = await post('/auth/forgot-password', {
      email: EMAIL,
      otp: '123456',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('replies identically whether or not the account exists', async () => {
    const unknown = await post('/auth/forgot-password', {
      email: `absent-${STAMP}@example.com`,
    });
    expect(unknown.status).toBe(201);
    expect(unknown.body.success).toBe(true);

    const known = await post('/auth/forgot-password', { email: EMAIL });
    expect(known.status).toBe(201);
    expect(known.body.message).toBe(unknown.body.message);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe(EMAIL);
  });

  it('stores only the hash of the emailed token', async () => {
    const res = await post('/auth/forgot-password', { email: EMAIL });
    expect(res.status).toBe(201);
    expect(mails).toHaveLength(2);

    const token = tokenFromMail();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(lastMail().url).toContain('/auth/reset-password?token=');

    const user = await app
      .get<Model<User>>(getModelToken(User.name))
      .findOne({ email: EMAIL })
      .lean();
    expect(user?.passwordResetToken).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(user?.passwordResetToken).not.toBe(token);
    expect(user?.passwordResetExpires?.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects an unknown token', async () => {
    const res = await post('/auth/reset-password', {
      token: 'f'.repeat(64),
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects a password that is too short', async () => {
    const res = await post('/auth/reset-password', {
      token: tokenFromMail(),
      newPassword: '123',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('changes the password with the emailed token, which then stops working', async () => {
    const token = tokenFromMail();

    const changed = await post('/auth/reset-password', {
      token,
      newPassword: NEW_PASSWORD,
    });
    expect(changed.status).toBe(201);
    expect(changed.body.success).toBe(true);

    const reused = await post('/auth/reset-password', {
      token,
      newPassword: 'ThirdPass789',
    });
    expect(reused.status).toBe(400);

    const user = await app
      .get<Model<User>>(getModelToken(User.name))
      .findOne({ email: EMAIL })
      .lean();
    expect(user?.passwordResetToken).toBeUndefined();
    expect(user?.passwordResetExpires).toBeUndefined();
  });

  it('signs in with the new password but not the old one', async () => {
    const oldPassword = await post('/auth/signin', {
      email: EMAIL,
      password: OLD_PASSWORD,
    });
    expect(oldPassword.status).toBe(401);

    const newPassword = await post('/auth/signin', {
      email: EMAIL,
      password: NEW_PASSWORD,
    });
    expect(newPassword.status).toBe(201);
    expect(newPassword.body.success).toBe(true);
    expect(newPassword.body.data?.['access_token']).toBeDefined();
  });
});
