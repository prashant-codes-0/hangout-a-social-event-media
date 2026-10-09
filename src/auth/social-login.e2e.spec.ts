import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import {
  MongooseModule,
  getConnectionToken,
  getModelToken,
} from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Connection, Model } from 'mongoose';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { User } from './schemas/user.schema';
import { EmailService } from '../common/services/email.service';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';

jest.setTimeout(60000);

const setSocialEnv = (value: string) => {
  process.env.GOOGLE_CLIENT_ID = value && `${value}-google-id`;
  process.env.GOOGLE_CLIENT_SECRET = value && `${value}-google-secret`;
  process.env.FACEBOOK_APP_ID = value && `${value}-fb-id`;
  process.env.FACEBOOK_APP_SECRET = value && `${value}-fb-secret`;
};

const TEST_DB = 'mongodb://localhost:27017/hangout-auth-social-e2e';
const STAMP = Date.now();

interface HttpBody {
  success: boolean;
  statusCode: number;
  message: string;
  data?: {
    email?: string;
    name?: string;
    role?: string;
    verified?: boolean;
  };
}

describe('social login (Google / Facebook)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let users: Model<User>;
  let authService: AuthService;


  const get = async (path: string, token?: string) => {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status, body: (await res.json()) as HttpBody };
  };

  const googleProfile = (email: string, id?: string, emailVerified = true) => ({
    provider: 'google' as const,
    providerId: id ?? `google-${email}`, // unique per test unless one is given
    email,
    emailVerified,
    name: 'Google Tester',
  });

  // These accounts never have 2FA on, so sign-in always yields a session
  const socialSignIn = async (
    profile: Parameters<AuthService['signInWithSocial']>[0],
  ) => {
    const result = await authService.signInWithSocial(profile);
    if (!('access_token' in result)) throw new Error('Unexpected 2FA challenge');
    return result;
  };

  beforeAll(async () => {
    // Make sure the env looks unconfigured no matter what the host .env holds,
    // so the "not configured" guards are what we exercise.
    setSocialEnv('');
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
    authService = app.get(AuthService);
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

  it('rejects Google login with a clear 503 while unconfigured', async () => {
    const res = await get('/auth/google');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Google sign-in is not configured');
    expect(res.body.message).toContain('GOOGLE_CLIENT_ID');
  });

  it('rejects Facebook login with a clear 503 while unconfigured', async () => {
    const res = await get('/auth/facebook');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Facebook sign-in is not configured');
    expect(res.body.message).toContain('FACEBOOK_APP_ID');
  });

  it('creates and verifies a brand-new account from a Google login', async () => {
    const email = `social-new-${STAMP}@example.com`;
    const result = await socialSignIn(googleProfile(email));
    expect(result.access_token).toBeTruthy();
    expect(result.user.email).toBe(email);
    expect(result.user.verified).toBe(true);

    const stored = await users.findOne({ email }).lean();
    expect(stored?.googleId).toBe(`google-${email}`);
    // Social users have an unusable but hash-shaped password.
    expect(stored?.passwordHash).toMatch(/^\$2/);
  });

  it('returns the same account on a repeat Google login', async () => {
    const email = `social-repeat-${STAMP}@example.com`;
    const first = await socialSignIn(googleProfile(email));
    const second = await socialSignIn(googleProfile(email));
    expect(String(second.user.id)).toBe(String(first.user.id));
    expect(await users.countDocuments({ email })).toBe(1);
  });

  it('links a Facebook login to the existing Google account (same email)', async () => {
    const email = `social-link-${STAMP}@example.com`;
    const google = await socialSignIn(
      googleProfile(email, `g-${STAMP}`),
    );
    const facebook = await socialSignIn({
      provider: 'facebook',
      providerId: `fb-${STAMP}`,
      email,
      emailVerified: true,
      name: 'Facebook Tester',
    });
    expect(String(facebook.user.id)).toBe(String(google.user.id));

    const stored = await users.findOne({ email }).lean();
    expect(stored?.googleId).toBe(`g-${STAMP}`);
    expect(stored?.facebookId).toBe(`fb-${STAMP}`);
  });

  it('links a Google login to an existing email/password account without changing its password', async () => {
    const email = `social-password-${STAMP}@example.com`;
    await users.create({
      name: 'Password User',
      email,
      passwordHash: await bcrypt.hash('OldPass123', 10),
      verified: false,
    });

    const social = await socialSignIn(
      googleProfile(email, `gp-${STAMP}`),
    );
    expect(social.user.verified).toBe(true);
    expect(social.user.email).toBe(email);

    const stored = await users.findOne({ email }).lean();
    expect(stored?.googleId).toBe(`gp-${STAMP}`);
    expect(
      await bcrypt.compare('OldPass123', stored?.passwordHash as string),
    ).toBe(true);
  });

  it('keeps untouched accounts unique when the profile has no email', async () => {
    const noEmail = {
      provider: 'google' as const,
      providerId: 'anonymized-google-id',
      email: null,
      name: null,
    };
    await expect(socialSignIn(noEmail)).rejects.toThrow(
      /did not share your email address/,
    );
  });

  it('never uses an email the provider has not verified', async () => {
    const email = `social-unverified-${STAMP}@example.com`;
    const victim = await users.create({
      name: 'Existing User',
      email,
      passwordHash: await bcrypt.hash('VictimPass123', 10),
      verified: true,
    });

    // Someone puts the victim's address on their own Google account
    await expect(
      socialSignIn(googleProfile(email, `attacker-${STAMP}`, false)),
    ).rejects.toThrow(/isn't verified/);

    const stored = await users.findById(victim._id).lean();
    expect(stored?.googleId).toBeUndefined();
    expect(await users.countDocuments({ email })).toBe(1);
  });

  it('links to an existing account whatever the email capitalisation', async () => {
    const typed = `Mixed.Case-${STAMP}@Example.com`;
    const existing = await users.create({
      name: 'Mixed Case',
      email: typed,
      passwordHash: await bcrypt.hash('Pass12345', 10),
    });

    const social = await socialSignIn(
      googleProfile(typed.toLowerCase(), `gm-${STAMP}`),
    );
    expect(String(social.user.id)).toBe(String(existing._id));
    expect(await users.countDocuments({ email: new RegExp(`^${typed.replace(/[.]/g, '\.')}$`, 'i') })).toBe(1);
  });

  it('keeps the account linked to a provider id even if its email changed', async () => {
    const first = await socialSignIn(
      googleProfile(`before-${STAMP}@example.com`, `gchange-${STAMP}`),
    );
    const later = await socialSignIn(
      googleProfile(`after-${STAMP}@example.com`, `gchange-${STAMP}`),
    );
    expect(String(later.user.id)).toBe(String(first.user.id));
  });

  it('reports which providers are configured', async () => {
    const res = await get('/auth/social/providers');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ google: false, facebook: false });
  });

  it('serves /auth/me to a token issued by a social login', async () => {
    const email = `social-me-${STAMP}@example.com`;
    const { access_token } = await socialSignIn(
      googleProfile(email, `gme-${STAMP}`),
    );

    const res = await get('/auth/me', access_token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.email).toBe(email);
    expect(res.body.data?.name).toBe('Google Tester');
    expect(res.body.data?.role).toBe('user');
    expect(res.body.data?.verified).toBe(true);
  });
});

// The browser-facing redirect flow, with (fake) credentials configured. Nothing here
// talks to Google: the provider is only reached for the code -> token exchange and the
// profile lookup, which the success case stubs.
describe('social login redirect flow (configured)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const FRONTEND = 'http://app.test';

  beforeAll(async () => {
    setSocialEnv('test');
    process.env.FRONTEND_URL = FRONTEND;
    process.env.GOOGLE_CALLBACK_URL = 'http://api.test/auth/google/callback';

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        MongooseModule.forRoot(TEST_DB.replace('-e2e', '-flow-e2e')),
        AuthModule,
      ],
    })
      .overrideProvider(EmailService)
      .useValue({ onModuleInit: () => undefined })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    const connection = app.get<Connection>(getConnectionToken());
    try {
      await connection.dropDatabase();
    } catch {
      /* the database may already be gone */
    }
    await app?.close();
    setSocialEnv('');
    delete process.env.FRONTEND_URL;
    delete process.env.GOOGLE_CALLBACK_URL;
  });

  const noFollow = (path: string, cookie?: string) =>
    fetch(`${baseUrl}${path}`, {
      redirect: 'manual',
      headers: cookie ? { cookie } : {},
    });

  const fragmentOf = (location: string | null) => {
    expect(location).toBeTruthy();
    const [base, fragment = ''] = (location as string).split('#');
    return { base, params: new URLSearchParams(fragment) };
  };

  it('reports both providers as configured', async () => {
    const res = await fetch(`${baseUrl}/auth/social/providers`);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toEqual({ google: true, facebook: true });
  });

  it('starts Google sign-in with a state value tied to an HttpOnly cookie', async () => {
    const res = await noFollow('/auth/google');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') as string);
    expect(location.hostname).toBe('accounts.google.com');
    const state = location.searchParams.get('state');
    expect(state).toMatch(/^[0-9a-f]{48}$/);

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`oauth_state_google=${state}`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  it('sends a cancelled Google sign-in back to the app with a message', async () => {
    const res = await noFollow('/auth/google/callback?error=access_denied');
    expect(res.status).toBe(302);
    const { base, params } = fragmentOf(res.headers.get('location'));
    expect(base).toBe(`${FRONTEND}/auth/social-callback`);
    expect(params.get('token')).toBeNull();
    expect(params.get('error')).toBe('Google sign-in was cancelled.');
  });

  it('rejects a callback whose state does not match the cookie (login CSRF)', async () => {
    const start = await noFollow('/auth/google');
    const cookie = (start.headers.get('set-cookie') ?? '').split(';')[0];

    const forged = await noFollow('/auth/google/callback?code=attacker-code&state=forged', cookie);
    const { params } = fragmentOf(forged.headers.get('location'));
    expect(params.get('token')).toBeNull();
    expect(params.get('error')).toMatch(/expired or was started elsewhere/);

    // No cookie at all (callback opened from another site)
    const missing = await noFollow('/auth/google/callback?code=attacker-code&state=whatever');
    expect(fragmentOf(missing.headers.get('location')).params.get('error')).toMatch(
      /expired or was started elsewhere/,
    );
  });

  it('completes a Google sign-in and passes the token in the URL fragment only', async () => {
    // Stub the two calls passport makes to Google: code -> token, token -> profile
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const passport = require('passport') as { _strategy: (name: string) => any };
    const google = passport._strategy('google');
    const oauth2 = google._oauth2;
    const originalGetToken = oauth2.getOAuthAccessToken;
    const originalProfile = google.userProfile;
    oauth2.getOAuthAccessToken = (_code: string, _params: unknown, cb: (...args: unknown[]) => void) =>
      cb(null, 'google-access-token', undefined, {});
    google.userProfile = (_token: string, done: (err: unknown, profile: unknown) => void) =>
      done(null, {
        id: `flow-${STAMP}`,
        displayName: 'Flow Tester',
        emails: [{ value: `flow-${STAMP}@example.com`, verified: true }],
        _json: { email_verified: true },
      });

    try {
      const start = await noFollow('/auth/google');
      const state = new URL(start.headers.get('location') as string).searchParams.get('state');
      const cookie = (start.headers.get('set-cookie') ?? '').split(';')[0];

      const res = await noFollow(`/auth/google/callback?code=good-code&state=${state}`, cookie);
      expect(res.status).toBe(302);
      const location = res.headers.get('location') as string;
      expect(location.split('#')[0]).toBe(`${FRONTEND}/auth/social-callback`); // no query string
      const { params } = fragmentOf(location);
      expect(params.get('provider')).toBe('google');
      expect(params.get('error')).toBeNull();
      const token = params.get('token') as string;
      expect(token.split('.')).toHaveLength(3); // a JWT

      // The state cookie is single-use
      expect(res.headers.get('set-cookie') ?? '').toMatch(/oauth_state_google=;/);

      const me = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      const body = (await me.json()) as HttpBody;
      expect(body.data?.email).toBe(`flow-${STAMP}@example.com`);
      expect(body.data?.verified).toBe(true);
    } finally {
      oauth2.getOAuthAccessToken = originalGetToken;
      google.userProfile = originalProfile;
    }
  });
});
