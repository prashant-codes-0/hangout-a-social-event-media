import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '../schemas/user.schema';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  matchTotp,
  otpauthUrl,
  totpDriftSeconds,
} from './totp';

/** How long the setup QR code stays valid before it must be started again. */
const SETUP_TTL_MS = 15 * 60 * 1000;
/** How long after the password step the person has to enter their code. */
const LOGIN_CHALLENGE_TTL = '5m';
/** Wrong codes in a row before checks are locked... */
const MAX_FAILED_ATTEMPTS = 5;
/** ...and for how long. */
const LOCK_MS = 15 * 60 * 1000;

/** The `purpose` claim on a challenge token; JwtStrategy refuses such tokens as sessions. */
export const TWO_FACTOR_TOKEN_PURPOSE = '2fa-login';
/** Purpose of the token that finishes an authenticator reset begun at sign-in. */
export const TWO_FACTOR_RESET_TOKEN_PURPOSE = '2fa-reset';

const SECRET_FIELDS =
  '+twoFactorSecret +twoFactorRecoveryCodes +twoFactorLastUsedStep +twoFactorFailedAttempts +twoFactorLockedUntil';

/** Thrown for a wrong code; callers pick the HTTP status that fits their context. */
class InvalidCodeError extends Error {}

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async getStatus(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('twoFactorEnabled +twoFactorRecoveryCodes');
    if (!user) throw new NotFoundException('User not found');
    return {
      enabled: !!user.twoFactorEnabled,
      recoveryCodesRemaining: user.twoFactorEnabled
        ? (user.twoFactorRecoveryCodes?.length ?? 0)
        : 0,
    };
  }

  /**
   * Step 1 of turning 2FA on: creates a secret for the authenticator app.
   * Nothing changes for sign-in until enable() confirms a code from it.
   */
  async startSetup(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already on.');
    }
    return this.createPendingSecret(user);
  }

  /**
   * Step 2: the person proves their app is set up by entering a code. Returns
   * the recovery codes; this is the only time they are ever shown.
   */
  async enable(userId: string, code: string) {
    const user = await this.userModel
      .findById(userId)
      .select('+twoFactorPendingSecret +twoFactorPendingExpires');
    if (!user) throw new NotFoundException('User not found');
    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already on.');
    }
    const step = this.matchPendingCode(user, code);

    const recoveryCodes = generateRecoveryCodes();
    await this.userModel.updateOne(
      { _id: user._id },
      {
        $set: {
          twoFactorEnabled: true,
          twoFactorSecret: user.twoFactorPendingSecret,
          twoFactorRecoveryCodes: recoveryCodes.map(hashRecoveryCode),
          twoFactorLastUsedStep: step,
          twoFactorFailedAttempts: 0,
        },
        $unset: {
          twoFactorPendingSecret: '',
          twoFactorPendingExpires: '',
          twoFactorLockedUntil: '',
        },
      },
    );

    return {
      message: 'Two-factor authentication is on.',
      enabled: true,
      recoveryCodes,
    };
  }

  /** Turns 2FA off; needs a current code (or a recovery code). */
  async disable(userId: string, code: string) {
    await this.checkCodeOrThrow(userId, code);
    await this.userModel.updateOne(
      { _id: userId },
      {
        $set: { twoFactorEnabled: false },
        $unset: {
          twoFactorSecret: '',
          twoFactorRecoveryCodes: '',
          twoFactorLastUsedStep: '',
          twoFactorFailedAttempts: '',
          twoFactorLockedUntil: '',
          twoFactorPendingSecret: '',
          twoFactorPendingExpires: '',
        },
      },
    );
    return { message: 'Two-factor authentication is off.', enabled: false };
  }

  /** Replaces all recovery codes (the old ones stop working). */
  async regenerateRecoveryCodes(userId: string, code: string) {
    await this.checkCodeOrThrow(userId, code);
    const recoveryCodes = generateRecoveryCodes();
    await this.userModel.updateOne(
      { _id: userId },
      { $set: { twoFactorRecoveryCodes: recoveryCodes.map(hashRecoveryCode) } },
    );
    return { message: 'New recovery codes created.', recoveryCodes };
  }

  /**
   * Moving to a new phone or authenticator app, step 1: after a current code
   * (or a recovery code, if the old phone is gone), returns a new secret for
   * the QR code. The old app keeps working until confirmReset().
   */
  async startReset(userId: string, code: string) {
    await this.checkCodeOrThrow(userId, code);
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return this.createPendingSecret(user);
  }

  /** Step 2: a code from the new app swaps it in; the old app's codes stop working. */
  async confirmReset(userId: string, code: string) {
    const user = await this.userModel
      .findById(userId)
      .select('+twoFactorPendingSecret +twoFactorPendingExpires');
    if (!user) throw new NotFoundException('User not found');
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not on.');
    }
    const step = this.matchPendingCode(user, code);

    // Recovery codes are untouched: they don't depend on the app
    await this.userModel.updateOne(
      { _id: user._id },
      {
        $set: {
          twoFactorSecret: user.twoFactorPendingSecret,
          twoFactorLastUsedStep: step,
          twoFactorFailedAttempts: 0,
        },
        $unset: {
          twoFactorPendingSecret: '',
          twoFactorPendingExpires: '',
          twoFactorLockedUntil: '',
        },
      },
    );
    return { message: 'Your new authenticator app is set up.', enabled: true };
  }

  /** A fresh secret waiting to be confirmed, for first setup and for reset. */
  private async createPendingSecret(user: User) {
    const secret = generateTotpSecret();
    user.twoFactorPendingSecret = encryptSecret(secret, this.encryptionKey);
    user.twoFactorPendingExpires = new Date(Date.now() + SETUP_TTL_MS);
    await user.save();

    return {
      secret,
      otpauthUrl: otpauthUrl(secret, user.email, this.issuer),
      expiresInMinutes: SETUP_TTL_MS / 60000,
    };
  }

  /** Checks a code against the pending secret; returns its time step or throws. */
  private matchPendingCode(user: User, code: string): number {
    if (
      !user.twoFactorPendingSecret ||
      !user.twoFactorPendingExpires ||
      user.twoFactorPendingExpires < new Date()
    ) {
      throw new BadRequestException(
        'This setup has expired. Scan a new QR code and try again.',
      );
    }
    const secret = decryptSecret(
      user.twoFactorPendingSecret,
      this.encryptionKey,
    );
    const digits = code.replace(/\s/g, '');
    const step = matchTotp(secret, digits);
    if (step === null) {
      this.logRejectedCode(String(user._id), secret, digits);
      throw new BadRequestException(
        "That code didn't match. Check that your phone's clock is right and enter the newest code.",
      );
    }
    return step;
  }

  // ---- Sign-in challenge ----

  /** A short-lived token proving the password step passed; only good for verifyLoginChallenge. */
  createLoginChallenge(user: User): string {
    return this.jwtService.sign(
      { sub: String(user._id), purpose: TWO_FACTOR_TOKEN_PURPOSE },
      { expiresIn: LOGIN_CHALLENGE_TTL },
    );
  }

  /** Checks the challenge token + code and returns the user id to sign in. */
  async verifyLoginChallenge(token: string, code: string): Promise<string> {
    const userId = await this.readPurposeToken(token, TWO_FACTOR_TOKEN_PURPOSE);
    await this.consumeCodeForLogin(userId, code);
    return userId;
  }

  /**
   * Resetting the authenticator from the sign-in code page (lost or changed
   * phone), step 1: the challenge token plus a recovery code (or a current
   * code) gets a new QR secret and a token for step 2. Equivalent to signing
   * in with that code and resetting from Settings.
   */
  async startResetFromLogin(twoFactorToken: string, code: string) {
    const userId = await this.readPurposeToken(
      twoFactorToken,
      TWO_FACTOR_TOKEN_PURPOSE,
    );
    await this.consumeCodeForLogin(userId, code);
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException('Invalid sign-in token.');

    const setup = await this.createPendingSecret(user);
    // Scanning and confirming can outlast the 5-minute sign-in token
    const resetToken = this.jwtService.sign(
      { sub: userId, purpose: TWO_FACTOR_RESET_TOKEN_PURPOSE },
      { expiresIn: SETUP_TTL_MS / 1000 },
    );
    return { ...setup, resetToken };
  }

  /** Step 2: a code from the new app swaps it in; returns the user id to sign in. */
  async confirmResetFromLogin(resetToken: string, code: string) {
    const userId = await this.readPurposeToken(
      resetToken,
      TWO_FACTOR_RESET_TOKEN_PURPOSE,
    );
    await this.confirmReset(userId, code);
    return userId;
  }

  /** The user id inside a valid, unexpired purpose token of the given kind. */
  private async readPurposeToken(
    token: string,
    purpose: string,
  ): Promise<string> {
    let payload: { sub?: string; purpose?: string };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException(
        'Your sign-in took too long. Please sign in again.',
      );
    }
    if (payload.purpose !== purpose || !payload.sub) {
      throw new UnauthorizedException('Invalid sign-in token.');
    }
    return payload.sub;
  }

  /** consumeCode before a session exists: a wrong code is a 401. */
  private async consumeCodeForLogin(userId: string, code: string) {
    try {
      await this.consumeCode(userId, code);
    } catch (error) {
      if (error instanceof InvalidCodeError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }

  // ---- Code checking ----

  /** consumeCode for signed-in actions: a wrong code is a 400, not a 401. */
  private async checkCodeOrThrow(userId: string, code: string) {
    try {
      return await this.consumeCode(userId, code);
    } catch (error) {
      if (error instanceof InvalidCodeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * Re-authenticate a signed-in user for a sensitive action (e.g. deleting the
   * account). Accepts an authenticator or recovery code and marks it used.
   */
  async verifyForSensitiveAction(userId: string, code: string): Promise<void> {
    await this.checkCodeOrThrow(userId, code);
  }

  /**
   * Accepts either an authenticator code or a recovery code and marks it used
   * (each TOTP time step and each recovery code works once). Too many wrong
   * codes in a row lock checks for LOCK_MS.
   */
  private async consumeCode(
    userId: string,
    rawCode: string,
  ): Promise<'totp' | 'recovery'> {
    const user = await this.userModel.findById(userId).select(SECRET_FIELDS);
    if (!user) throw new NotFoundException('User not found');
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not on.');
    }
    if (user.twoFactorLockedUntil && user.twoFactorLockedUntil > new Date()) {
      const minutes = Math.ceil(
        (user.twoFactorLockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new HttpException(
        `Too many wrong codes. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = rawCode.trim();
    const reset = {
      $set: { twoFactorFailedAttempts: 0 },
      $unset: { twoFactorLockedUntil: '' },
    };

    if (/^\d[\d\s]*$/.test(code)) {
      const secret = decryptSecret(user.twoFactorSecret, this.encryptionKey);
      const digits = code.replace(/\s/g, '');
      const step = matchTotp(secret, digits, user.twoFactorLastUsedStep ?? -1);
      if (step === null) this.logRejectedCode(String(user._id), secret, digits);
      if (step !== null) {
        // Conditional update, so two requests racing with one code can't both win
        const claimed = await this.userModel.updateOne(
          {
            _id: user._id,
            $or: [
              { twoFactorLastUsedStep: { $exists: false } },
              { twoFactorLastUsedStep: { $lt: step } },
            ],
          },
          { ...reset, $set: { ...reset.$set, twoFactorLastUsedStep: step } },
        );
        if (claimed.modifiedCount === 1) return 'totp';
      }
    } else {
      const hash = hashRecoveryCode(code);
      const claimed = await this.userModel.updateOne(
        { _id: user._id, twoFactorRecoveryCodes: hash },
        { ...reset, $pull: { twoFactorRecoveryCodes: hash } },
      );
      if (claimed.modifiedCount === 1) return 'recovery';
    }

    await this.recordFailure(String(user._id));
    throw new InvalidCodeError(
      "That code isn't valid. Enter the newest code from your authenticator app, or a recovery code.",
    );
  }

  /**
   * Explains a rejected authenticator code in the server log, so clock drift
   * (the usual cause) is obvious instead of looking like a wrong code.
   */
  private logRejectedCode(userId: string, secret: string, code: string) {
    const drift = totpDriftSeconds(secret, code);
    if (drift === null) {
      this.logger.warn(
        `2FA code rejected for user ${userId}: it matches no time within 10 minutes (wrong or outdated entry in the authenticator app?)`,
      );
    } else if (Math.abs(drift) <= 60) {
      this.logger.warn(
        `2FA code rejected for user ${userId}: it was already used`,
      );
    } else {
      this.logger.warn(
        `2FA code rejected for user ${userId}: it would be valid ${Math.abs(drift)}s ${drift > 0 ? 'later' : 'earlier'}. ` +
          `The server clock (${new Date().toISOString()}) or the phone clock is off; sync them.`,
      );
    }
  }

  private async recordFailure(userId: string) {
    const updated = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $inc: { twoFactorFailedAttempts: 1 } },
        { new: true },
      )
      .select('+twoFactorFailedAttempts');
    if ((updated?.twoFactorFailedAttempts ?? 0) >= MAX_FAILED_ATTEMPTS) {
      await this.userModel.updateOne(
        { _id: userId },
        {
          $set: {
            twoFactorLockedUntil: new Date(Date.now() + LOCK_MS),
            twoFactorFailedAttempts: 0,
          },
        },
      );
    }
  }

  /**
   * Key for encrypting TOTP secrets. Set TWO_FACTOR_ENCRYPTION_KEY so that
   * rotating JWT_SECRET doesn't make existing secrets unreadable.
   */
  private get encryptionKey(): string {
    return (
      this.configService.get<string>('TWO_FACTOR_ENCRYPTION_KEY') ||
      this.configService.get<string>('JWT_SECRET', 'your-secret-key')
    );
  }

  /** The name authenticator apps show next to the code. */
  private get issuer(): string {
    return this.configService.get<string>('TWO_FACTOR_ISSUER', 'Hangouts');
  }
}
