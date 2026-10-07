import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { User, UserRole } from './schemas/user.schema';
import { SignUpDto, SignInDto } from './dto/auth.dto';
import { UpdateSettingsDto, SettingsResponse } from './dto/settings.dto';
import { EmailService } from '../common/services/email.service';

/** Password reset links live this long, and each link works exactly once. */
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    private jwtService: JwtService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  async signUp(signUpDto: SignUpDto) {
    const { name, email, password } = signUpDto;

    // Check if user already exists
    const existingUser = await this.userModel.findOne({ email });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = new this.userModel({
      name,
      email,
      passwordHash,
    });

    await user.save();

    // Generate JWT token
    const payload = { sub: user._id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        verified: user.verified,
      },
    };
  }

  async signIn(signInDto: SignInDto) {
    const { email, password } = signInDto;

    // Find user
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT token
    const payload = { sub: user._id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        verified: user.verified,
      },
    };
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.userModel.findOne({ email });
    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      const { passwordHash, ...result } = user.toObject();
      return result;
    }
    return null;
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id);
  }

  /** The current user, safe to send to the client. */
  async getMe(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified,
    };
  }

  /**
   * Signs in (or creates) the account behind a Google/Facebook login and
   * returns the same shape as signIn/signUp, i.e. an access token + user.
   *
   * Linking rules:
   * - A provider-verified email is matched against existing accounts, so a
   *   social login attaches to an already-registered email/password account.
   * - An email the provider has NOT verified is never used: otherwise anyone
   *   could add someone else's address to a Google account and take over
   *   that person's Hangouts account. Such logins match by provider id only.
   * - A provider-verified email marks the account as verified.
   */
  async signInWithSocial(profile: {
    provider: 'google' | 'facebook';
    providerId: string;
    email?: string | null;
    emailVerified?: boolean;
    name?: string | null;
  }) {
    const { provider, providerId, name } = profile;
    const email = profile.emailVerified ? profile.email?.trim().toLowerCase() || null : null;
    const providerField = provider === 'google' ? 'googleId' : 'facebookId';

    // The account already linked to this provider id wins (the person may have
    // changed their email at Google/Facebook since); otherwise match by email.
    // Signup stores emails as typed, so the email match is case-insensitive.
    let user = await this.userModel.findOne({ [providerField]: providerId });
    if (!user && email) {
      user = await this.userModel.findOne({
        email: new RegExp(`^${escapeRegExp(email)}$`, 'i'),
      });
    }

    if (!user && email) {
      user = new this.userModel({
        name: name || email.split('@')[0] || 'Hangouts User',
        email,
        // Social logins have no password of their own; store a hash of an
        // unguessable value so password sign-in simply never matches.
        passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
        verified: true,
        [providerField]: providerId,
      });
      try {
        await user.save();
      } catch (error) {
        // Two first-time logins can race; losing one just means the email
        // already exists, so fall back to matching that account.
        if ((error as { code?: number }).code === 11000) {
          user = await this.userModel.findOne({ email: new RegExp(`^${escapeRegExp(email)}$`, 'i') });
        } else {
          throw error;
        }
      }
    }

    if (!user) {
      const label = provider === 'google' ? 'Google' : 'Facebook';
      throw new UnauthorizedException(
        profile.email
          ? `Your ${label} email address isn't verified yet. Verify it with ${label}, or sign up with email instead.`
          : `${label} did not share your email address, so no account can be created. Allow email access, or sign up with email instead.`,
      );
    }

    // Link the external id and trust the provider's identity on the account.
    let changed = false;
    if (!user[providerField]) {
      user[providerField] = providerId;
      changed = true;
    }
    if (email && !user.verified) {
      user.verified = true;
      changed = true;
    }
    if (changed) {
      await user.save();
    }

    return this.issueTokenForUser(user);
  }

  /** Builds the token + user payload shared by every sign-in path. */
  private issueTokenForUser(user: User) {
    const payload = { sub: user._id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);
    return {
      access_token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        verified: user.verified,
      },
    };
  }

  // ---- Password reset ----

  /**
   * Emails a one-time reset link.
   *
   * Always answers with the same message whether or not the account exists, so
   * this endpoint cannot be used to discover which addresses are registered.
   */
  async forgotPassword(email: string) {
    const response = {
      message:
        'If that address has an account, a password reset link is on its way.',
    };

    const user = await this.userModel.findOne({ email });
    if (!user) {
      return response;
    }

    // The email carries the readable token; only its digest is stored.
    const token = randomBytes(32).toString('hex');
    user.passwordResetToken = createHash('sha256').update(token).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:4200',
    );
    const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}`;

    await this.emailService.sendPasswordResetEmail(
      user.email,
      user.name,
      resetUrl,
      RESET_TOKEN_TTL_MS / 60000,
    );

    return response;
  }

  /**
   * Applies the new password if the token matches and has not expired.
   * The update also clears the token (single use) and any pending OTP.
   */
  async resetPassword(token: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 10);

    const user = await this.userModel.findOneAndUpdate(
      {
        passwordResetToken: createHash('sha256').update(token).digest('hex'),
        passwordResetExpires: { $gt: new Date() },
      },
      {
        $set: { passwordHash },
        $unset: {
          passwordResetToken: '',
          passwordResetExpires: '',
          otpCode: '',
          otpExpiry: '',
        },
      },
    );

    if (!user) {
      throw new BadRequestException(
        'This reset link is invalid or has expired. Please request a new one.',
      );
    }

    return {
      message: 'Password updated. You can now sign in with your new password.',
    };
  }

  // ---- App settings (per account) ----

  async getSettings(userId: string): Promise<SettingsResponse> {
    const user = await this.userModel
      .findById(userId)
      .select('settings')
      .lean();
    if (!user) throw new NotFoundException('User not found');
    return this.withDefaults(user.settings);
  }

  async updateSettings(
    userId: string,
    dto: UpdateSettingsDto,
  ): Promise<SettingsResponse> {
    // Only touch the fields that were sent
    const changes: Record<string, boolean> = {};
    if (typeof dto.notificationSounds === 'boolean')
      changes['settings.notificationSounds'] = dto.notificationSounds;
    if (typeof dto.callRingtone === 'boolean')
      changes['settings.callRingtone'] = dto.callRingtone;

    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: changes }, { new: true })
      .select('settings')
      .lean();
    if (!user) throw new NotFoundException('User not found');
    return this.withDefaults(user.settings);
  }

  // Users created before settings existed have none stored: fill in the defaults
  private withDefaults(
    settings?: Partial<SettingsResponse> | null,
  ): SettingsResponse {
    return {
      notificationSounds: settings?.notificationSounds ?? true,
      callRingtone: settings?.callRingtone ?? true,
    };
  }

  /**
   * Change the user's role and mark them verified.
   * This is the behavior previously exposed as `verifyUser`.
   */
  async changeRoleAndVerify(userId: string, role: UserRole): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.verified = true;
    user.role = role;
    await user.save();

    return user;
  }

  /**
   * Verify the user only (set verified = true) without changing role.
   */
  async verifyUserOnly(userId: string, otpCode: string): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if OTP is valid
    if (!user.otpCode || user.otpCode !== otpCode) {
      throw new BadRequestException('Invalid OTP code');
    }

    // Check if OTP is expired
    if (!user.otpExpiry || user.otpExpiry < new Date()) {
      throw new BadRequestException('OTP code has expired');
    }

    user.verified = true;
    user.otpCode = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Send welcome email
    await this.emailService.sendWelcomeEmail(user.email, user.name);

    return user;
  }

  async sendOTP(email: string) {
    const user = await this.userModel.findOne({ email });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.verified) {
      throw new BadRequestException('User is already verified');
    }

    // Generate OTP
    const otpCode = this.emailService.generateOTP();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10); // OTP expires in 10 minutes

    // Save OTP to user
    user.otpCode = otpCode;
    user.otpExpiry = otpExpiry;
    await user.save();

    // Send OTP email
    await this.emailService.sendOTPEmail(user.email, user.name, otpCode);

    return {
      success: true,
      message: 'OTP sent successfully to your email',
      data: {
        email: user.email,
        expiresIn: '10 minutes',
      },
    };
  }

  async verifyOTP(email: string, otpCode: string) {
    const user = await this.userModel.findOne({ email });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if OTP is valid
    if (!user.otpCode || user.otpCode !== otpCode) {
      throw new BadRequestException('Invalid OTP code');
    }

    // Check if OTP is expired
    if (!user.otpExpiry || user.otpExpiry < new Date()) {
      throw new BadRequestException('OTP code has expired');
    }

    user.verified = true;
    user.otpCode = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Send welcome email
    await this.emailService.sendWelcomeEmail(user.email, user.name);

    return {
      success: true,
      message: 'Email verified successfully',
      data: {
        userId: user._id,
        name: user.name,
        email: user.email,
        verified: user.verified,
      },
    };
  }

  async resendOTP(email: string) {
    return this.sendOTP(email);
  }

  async getAllUsers(): Promise<User[]> {
    return this.userModel.find({}, '-passwordHash').exec();
  }
}
