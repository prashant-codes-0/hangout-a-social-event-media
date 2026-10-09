import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

/**
 * Time-based one-time passwords (RFC 6238), the codes authenticator apps
 * (Google Authenticator, Authy, 1Password, ...) show. Built on node:crypto so
 * no extra dependency is needed.
 */

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/**
 * Accept codes up to 2 steps (±60s) either side of now, so a server or phone
 * clock that is a little off still works.
 */
const TOTP_WINDOW = 2;
/** How far drift diagnostics look, in steps (±10 minutes). */
const DRIFT_SEARCH_STEPS = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new random 160-bit secret, base32-encoded as authenticator apps expect. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The 30-second time step a moment falls in. */
export function currentTimeStep(now = Date.now()): number {
  return Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code for one time step (HOTP, RFC 4226). */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret))
    .update(counter)
    .digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Checks a code against the steps around now and returns the step it matched,
 * or null. Steps at or before `lastUsedStep` are refused, so a code that has
 * already been used cannot be replayed.
 */
export function matchTotp(
  secret: string,
  code: string,
  lastUsedStep = -1,
  now = Date.now(),
): number | null {
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code)) return null;
  const current = currentTimeStep(now);
  for (
    let step = current - TOTP_WINDOW;
    step <= current + TOTP_WINDOW;
    step++
  ) {
    if (step < 0 || step <= lastUsedStep) continue;
    if (safeEqual(totpCode(secret, step), code)) return step;
  }
  return null;
}

/**
 * For a rejected code: how many seconds away from now it would have been
 * valid (positive = the phone is ahead of the server), or null if it matches
 * no nearby time at all (wrong secret, e.g. an old entry in the app).
 * Only used for logging, never to accept a code.
 */
export function totpDriftSeconds(
  secret: string,
  code: string,
  now = Date.now(),
): number | null {
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code)) return null;
  const current = currentTimeStep(now);
  for (let distance = 0; distance <= DRIFT_SEARCH_STEPS; distance++) {
    for (const step of [current + distance, current - distance]) {
      if (step < 0) continue;
      if (safeEqual(totpCode(secret, step), code)) {
        return (step - current) * TOTP_PERIOD_SECONDS;
      }
    }
  }
  return null;
}

/** The otpauth:// link authenticator apps read from the QR code. */
export function otpauthUrl(
  secret: string,
  accountName: string,
  issuer: string,
): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ---- Recovery codes ----

const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes (0/o, 1/l/i)

/** One-time backup codes such as "k7m2p-x9qrt", for when the phone is lost. */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from(
      randomBytes(10),
      (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length],
    );
    return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
  });
}

/** Lower-cases and drops spaces/dashes, so "K7M2P X9QRT" matches "k7m2p-x9qrt". */
export function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[\s-]/g, '');
}

/** Recovery codes are high-entropy, so a plain SHA-256 digest is enough to store them. */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

// ---- Secret encryption at rest ----

/**
 * Encrypts the TOTP secret (AES-256-GCM) so a leaked database row alone can't
 * generate codes. Output: "iv.tag.ciphertext", each base64.
 */
export function encryptSecret(plain: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(key), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString('base64'))
    .join('.');
}

export function decryptSecret(payload: string, key: string): string {
  const [iv, tag, encrypted] = payload
    .split('.')
    .map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}

function deriveKey(key: string): Buffer {
  return createHash('sha256').update(key).digest();
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
