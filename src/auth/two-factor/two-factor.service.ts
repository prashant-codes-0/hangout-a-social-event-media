import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
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

const SECRET_FIELDS =
  '+twoFactorSecret +twoFactorRecoveryCodes +twoFactorLastUsedStep +twoFactorFailedAttempts +twoFactorLockedUntil';

/** Thrown for a wrong code; callers pick the HTTP status that fits their context. */
class InvalidCodeError extends Error {}

@Injectable()
export class TwoFactorService {
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
    if (
      !user.twoFactorPendingSecret ||
      !user.twoFactorPendingExpires ||
      user.twoFactorPendingExpires < new Date()
    ) {
      throw new BadRequestException(
        'This setup has expired. Start setting up two-factor authentication again.',
      );
    }

    const secret = decryptSecret(
      user.twoFactorPendingSecret,
      this.encryptionKey,
    );
    const step = matchTotp(secret, code.replace(/\s/g, ''));
    if (step === null) {
      throw new BadRequestException(
        "That code didn't match. Check that your phone's clock is right and enter the newest code.",
      );
    }

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
    let payload: { sub?: string; purpose?: string };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException(
        'Your sign-in took too long. Please sign in again.',
      );
    }
    if (payload.purpose !== TWO_FACTOR_TOKEN_PURPOSE || !payload.sub) {
      throw new UnauthorizedException('Invalid sign-in token.');
    }

    try {
      await this.consumeCode(payload.sub, code);
    } catch (error) {
      if (error instanceof InvalidCodeError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
    return payload.sub;
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
      const step = matchTotp(
        decryptSecret(user.twoFactorSecret, this.encryptionKey),
        code.replace(/\s/g, ''),
        user.twoFactorLastUsedStep ?? -1,
      );
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
