import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

const STATE_TTL_SECONDS = 10 * 60;

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (
  err: Error | null,
  ok: boolean,
  info?: string | { message: string },
) => void;

/**
 * OAuth `state` check without server sessions (the API is stateless/JWT).
 *
 * Starting a login puts a random nonce in a short-lived, HttpOnly cookie on
 * the API's domain and sends the same nonce to Google/Facebook as `state`.
 * The callback is only accepted when the two match, so another site cannot
 * finish a login in the victim's browser with the attacker's account
 * (login CSRF). The cookie is SameSite=Lax, which browsers still send on the
 * provider's top-level redirect back to the callback.
 *
 * Implements passport-oauth2's state store interface: store(req, meta, cb) /
 * verify(req, state, meta, cb).
 */
export class OAuthCookieStateStore {
  private readonly cookieName: string;

  constructor(provider: 'google' | 'facebook') {
    this.cookieName = `oauth_state_${provider}`;
  }

  store(req: Request, _meta: unknown, callback: StoreCallback): void {
    const nonce = randomBytes(24).toString('hex');
    req.res?.cookie(this.cookieName, nonce, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttps(req),
      maxAge: STATE_TTL_SECONDS * 1000,
      path: '/auth',
    });
    callback(null, nonce);
  }

  verify(
    req: Request,
    providedState: string,
    _meta: unknown,
    callback: VerifyCallback,
  ): void {
    const expected = readCookie(req, this.cookieName);
    // One use only
    req.res?.clearCookie(this.cookieName, { path: '/auth' });

    if (!expected || !providedState || !safeEqual(expected, providedState)) {
      callback(null, false, {
        message:
          'Your sign-in session expired or was started elsewhere. Please try again.',
      });
      return;
    }
    callback(null, true, providedState);
  }
}

function isHttps(req: Request): boolean {
  // Railway and most hosts terminate TLS at a proxy
  return (
    req.secure ||
    String(req.headers['x-forwarded-proto'] ?? '')
      .split(',')[0]
      .trim() === 'https'
  );
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
