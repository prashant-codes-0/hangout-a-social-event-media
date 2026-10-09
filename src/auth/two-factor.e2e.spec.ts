import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import {
  MongooseModule,
  getConnectionToken,
  getModelToken,
} from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { AuthModule } from './auth.module';
import { User } from './schemas/user.schema';
import { EmailService } from '../common/services/email.service';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import {
  base32Encode,
  currentTimeStep,
  matchTotp,
  totpCode,
  totpDriftSeconds,
} from './two-factor/totp';

jest.setTimeout(60000);

const TEST_DB = 'mongodb://localhost:27017/hangout-auth-2fa-e2e';
const STAMP = Date.now();
const PASSWORD = 'correct-horse-9';

interface HttpBody {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

describe('TOTP helpers', () => {
  // RFC 6238 appendix B test secret ("12345678901234567890"), SHA-1
  const secret = base32Encode(Buffer.from('12345678901234567890'));

  it('matches the RFC 6238 test vectors', () => {
    expect(totpCode(secret, 1)).toBe('287082'); // T = 59s
    expect(totpCode(secret, 37037036)).toBe('081804'); // T = 1111111109s
  });

  it('accepts the neighbouring step but refuses used and far-off steps', () => {
    const now = 59 * 1000 + 30 * 1000 * 10; // step 11
    expect(matchTotp(secret, totpCode(secret, 12), -1, now)).toBe(12);
    expect(matchTotp(secret, totpCode(secret, 12), 12, now)).toBeNull();
    expect(matchTotp(secret, totpCode(secret, 14), -1, now)).toBeNull(); // 3 steps away
    expect(matchTotp(secret, 'abcdef', -1, now)).toBeNull();
  });

  it('tolerates clocks up to 60s apart (2 steps either way)', () => {
    const now = 59 * 1000 + 30 * 1000 * 10; // step 11
    expect(matchTotp(secret, totpCode(secret, 13), -1, now)).toBe(13);
    expect(matchTotp(secret, totpCode(secret, 9), -1, now)).toBe(9);
  });

  it('explains rejected codes by how far off the clock is', () => {
    const now = 59 * 1000 + 30 * 1000 * 10; // step 11
    expect(totpDriftSeconds(secret, totpCode(secret, 16), now)).toBe(150);
    expect(totpDriftSeconds(secret, totpCode(secret, 5), now)).toBe(-180);
    expect(totpDriftSeconds(secret, totpCode(secret, 500), now)).toBeNull();
  });
});

describe('two-factor authentication', () => {
  let app: INestApplication;
  let baseUrl: string;
  let users: Model<User>;

  const call = async (
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    token?: string,
  ) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: (await res.json()) as HttpBody };
  };

  /** Signs up a fresh account and turns 2FA on; returns what later steps need. */
  const userWith2fa = async (tag: string) => {
    const email = `2fa-${tag}-${STAMP}@example.com`;
    const signup = await call('POST', '/auth/signup', {
      name: '2FA Tester',
      email,
      password: PASSWORD,
    });
    const session = signup.body.data!.access_token as string;

    const setup = await call('POST', '/auth/2fa/setup', undefined, session);
    expect(setup.status).toBe(201);
    const secret = setup.body.data!.secret as string;
    expect(setup.body.data!.otpauthUrl).toContain(`secret=${secret}`);

    const step = currentTimeStep();
    const enable = await call(
      'POST',
      '/auth/2fa/enable',
      { code: totpCode(secret, step) },
      session,
    );
    expect(enable.status).toBe(201);
    const recoveryCodes = enable.body.data!.recoveryCodes as string[];
    return { email, session, secret, step, recoveryCodes };
  };

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
        sendPasswordResetEmail: () => undefined,
      })
      .compile();

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
    users = app.get<Model<User>>(getModelToken(User.name));
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

  it('turns on with a code and returns 10 recovery codes', async () => {
    const { session, recoveryCodes } = await userWith2fa('enable');
    expect(recoveryCodes).toHaveLength(10);

    const status = await call('GET', '/auth/2fa/status', undefined, session);
    expect(status.body.data).toEqual({
      enabled: true,
      recoveryCodesRemaining: 10,
    });
    const me = await call('GET', '/auth/me', undefined, session);
    expect(me.body.data!.twoFactorEnabled).toBe(true);
  });

  it('refuses to turn on with a wrong code', async () => {
    const signup = await call('POST', '/auth/signup', {
      name: 'Wrong Code',
      email: `2fa-wrong-${STAMP}@example.com`,
      password: PASSWORD,
    });
    const session = signup.body.data!.access_token as string;
    await call('POST', '/auth/2fa/setup', undefined, session);
    const enable = await call(
      'POST',
      '/auth/2fa/enable',
      { code: '000000' },
      session,
    );
    expect(enable.status).toBe(400);
  });

  it('keeps secrets out of normal queries', async () => {
    const { email } = await userWith2fa('hidden');
    const doc = (await users.findOne({ email }).lean()) as Record<
      string,
      unknown
    >;
    expect(doc.twoFactorEnabled).toBe(true);
    expect(doc.twoFactorSecret).toBeUndefined();
    expect(doc.twoFactorRecoveryCodes).toBeUndefined();
  });

  it('makes password sign-in ask for a code, then issues a session', async () => {
    const { email, secret, step } = await userWith2fa('login');

    const signin = await call('POST', '/auth/signin', {
      email,
      password: PASSWORD,
    });
    expect(signin.status).toBe(201);
    expect(signin.body.data!.twoFactorRequired).toBe(true);
    expect(signin.body.data!.access_token).toBeUndefined();
    const challenge = signin.body.data!.twoFactorToken as string;

    // The challenge token is not a session
    const asSession = await call('GET', '/auth/me', undefined, challenge);
    expect(asSession.status).toBe(401);

    // The code used to turn 2FA on can't be replayed
    const replay = await call('POST', '/auth/2fa/verify', {
      twoFactorToken: challenge,
      code: totpCode(secret, step),
    });
    expect(replay.status).toBe(401);

    const nextCode = totpCode(secret, step + 1);
    const verify = await call('POST', '/auth/2fa/verify', {
      twoFactorToken: challenge,
      code: nextCode,
    });
    expect(verify.status).toBe(201);
    expect(verify.body.data!.user.email).toBe(email);
    const me = await call(
      'GET',
      '/auth/me',
      undefined,
      verify.body.data!.access_token,
    );
    expect(me.status).toBe(200);

    // ...and neither can the one just used
    const again = await call('POST', '/auth/2fa/verify', {
      twoFactorToken: challenge,
      code: nextCode,
    });
    expect(again.status).toBe(401);
  });

  it('accepts each recovery code once', async () => {
    const { email, session, recoveryCodes } = await userWith2fa('recovery');
    const signin = await call('POST', '/auth/signin', {
      email,
      password: PASSWORD,
    });
    const twoFactorToken = signin.body.data!.twoFactorToken as string;

    // Case and the dash don't matter
    const typed = recoveryCodes[0].toUpperCase().replace('-', ' ');
    const first = await call('POST', '/auth/2fa/verify', {
      twoFactorToken,
      code: typed,
    });
    expect(first.status).toBe(201);
    const second = await call('POST', '/auth/2fa/verify', {
      twoFactorToken,
      code: recoveryCodes[0],
    });
    expect(second.status).toBe(401);

    const status = await call('GET', '/auth/2fa/status', undefined, session);
    expect(status.body.data!.recoveryCodesRemaining).toBe(9);
  });

  it('regenerates recovery codes, invalidating the old ones', async () => {
    const { session, recoveryCodes } = await userWith2fa('regen');
    const regen = await call(
      'POST',
      '/auth/2fa/recovery-codes',
      { code: recoveryCodes[0] },
      session,
    );
    expect(regen.status).toBe(201);
    const fresh = regen.body.data!.recoveryCodes as string[];
    expect(fresh).toHaveLength(10);

    const old = await call(
      'POST',
      '/auth/2fa/disable',
      { code: recoveryCodes[1] },
      session,
    );
    expect(old.status).toBe(400);
    const ok = await call(
      'POST',
      '/auth/2fa/disable',
      { code: fresh[0] },
      session,
    );
    expect(ok.status).toBe(201);
  });

  it('turns off with a code, after which sign-in is password-only again', async () => {
    const { email, session, secret, step } = await userWith2fa('disable');
    const wrong = await call(
      'POST',
      '/auth/2fa/disable',
      { code: 'zzzzz-zzzzz' },
      session,
    );
    expect(wrong.status).toBe(400);

    const off = await call(
      'POST',
      '/auth/2fa/disable',
      { code: totpCode(secret, step + 1) },
      session,
    );
    expect(off.status).toBe(201);

    const signin = await call('POST', '/auth/signin', {
      email,
      password: PASSWORD,
    });
    expect(signin.body.data!.access_token).toBeDefined();
    expect(signin.body.data!.twoFactorRequired).toBeUndefined();
  });

  it('moves 2FA to a new authenticator app, keeping recovery codes', async () => {
    const { email, session, secret, step, recoveryCodes } =
      await userWith2fa('reset');

    const wrong = await call(
      'POST',
      '/auth/2fa/reset',
      { code: 'zzzzz-zzzzz' },
      session,
    );
    expect(wrong.status).toBe(400);

    // Old phone lost: a recovery code starts the reset
    const start = await call(
      'POST',
      '/auth/2fa/reset',
      { code: recoveryCodes[0] },
      session,
    );
    expect(start.status).toBe(201);
    const newSecret = start.body.data!.secret as string;
    expect(newSecret).not.toBe(secret);

    const badConfirm = await call(
      'POST',
      '/auth/2fa/reset/confirm',
      { code: totpCode(secret, step + 1) }, // a code from the OLD app
      session,
    );
    expect(badConfirm.status).toBe(400);

    const confirm = await call(
      'POST',
      '/auth/2fa/reset/confirm',
      { code: totpCode(newSecret, currentTimeStep()) },
      session,
    );
    expect(confirm.status).toBe(201);

    // Sign-in now takes the new app's codes, not the old one's
    const signin = await call('POST', '/auth/signin', {
      email,
      password: PASSWORD,
    });
    const twoFactorToken = signin.body.data!.twoFactorToken as string;
    const oldCode = await call('POST', '/auth/2fa/verify', {
      twoFactorToken,
      code: totpCode(secret, currentTimeStep() + 2),
    });
    expect(oldCode.status).toBe(401);
    const newCode = await call('POST', '/auth/2fa/verify', {
      twoFactorToken,
      code: totpCode(newSecret, currentTimeStep() + 1),
    });
    expect(newCode.status).toBe(201);

    const status = await call('GET', '/auth/2fa/status', undefined, session);
    expect(status.body.data).toEqual({
      enabled: true,
      recoveryCodesRemaining: 9,
    });
  });

  it('resets the authenticator from the sign-in code page and signs in', async () => {
    const { email, secret, recoveryCodes } = await userWith2fa('login-reset');
    const signin = await call('POST', '/auth/signin', {
      email,
      password: PASSWORD,
    });
    const twoFactorToken = signin.body.data!.twoFactorToken as string;

    const wrong = await call('POST', '/auth/2fa/verify/reset', {
      twoFactorToken,
      code: 'zzzzz-zzzzz',
    });
    expect(wrong.status).toBe(401);

    const start = await call('POST', '/auth/2fa/verify/reset', {
      twoFactorToken,
      code: recoveryCodes[0],
    });
    expect(start.status).toBe(201);
    const { secret: newSecret, resetToken } = start.body.data as {
      secret: string;
      resetToken: string;
    };
    expect(newSecret).not.toBe(secret);

    // The reset token is not a session
    const asSession = await call('GET', '/auth/me', undefined, resetToken);
    expect(asSession.status).toBe(401);
    // ...and the sign-in token can't stand in for it
    const swapped = await call('POST', '/auth/2fa/verify/reset/confirm', {
      resetToken: twoFactorToken,
      code: totpCode(newSecret, currentTimeStep()),
    });
    expect(swapped.status).toBe(401);

    const confirm = await call('POST', '/auth/2fa/verify/reset/confirm', {
      resetToken,
      code: totpCode(newSecret, currentTimeStep()),
    });
    expect(confirm.status).toBe(201);
    expect(confirm.body.data!.user.email).toBe(email);
    const me = await call(
      'GET',
      '/auth/me',
      undefined,
      confirm.body.data!.access_token,
    );
    expect(me.status).toBe(200);
  });

  it('locks code checks after 5 wrong codes', async () => {
    const { email, secret, step } = await userWith2fa('lockout');
    const signin = await call('POST', '/auth/signin', {
      email,
      password: PASSWORD,
    });
    const twoFactorToken = signin.body.data!.twoFactorToken as string;

    for (let i = 0; i < 5; i++) {
      const res = await call('POST', '/auth/2fa/verify', {
        twoFactorToken,
        code: 'aaaaa-aaaaa',
      });
      expect(res.status).toBe(401);
    }
    // Even a right code is refused while locked
    const locked = await call('POST', '/auth/2fa/verify', {
      twoFactorToken,
      code: totpCode(secret, step + 1),
    });
    expect(locked.status).toBe(429);
  });
});
