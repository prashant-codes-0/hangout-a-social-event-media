import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SPONSOR = 'sponsor',
}

// Per-account app preferences (saved on the server so they follow the user across devices)
@Schema({ _id: false })
export class UserSettings {
  // Chimes for messages, chat requests and other alerts
  @Prop({ default: true })
  notificationSounds: boolean;

  // Ringtone for incoming audio/video calls (the on-screen call popup shows either way)
  @Prop({ default: true })
  callRingtone: boolean;
}

export const UserSettingsSchema = SchemaFactory.createForClass(UserSettings);

// A badge earned through hangouts; name/icon are snapshotted so the rules can evolve freely
@Schema({ _id: false })
export class UserBadge {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  icon: string;

  @Prop({ default: () => new Date() })
  earnedAt: Date;
}

export const UserBadgeSchema = SchemaFactory.createForClass(UserBadge);

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Prop({ default: false })
  verified: boolean;

  @Prop()
  otpCode?: string;

  @Prop()
  otpExpiry?: Date;

  /**
   * Password reset token, stored as a SHA-256 digest. The readable token only
   * ever exists inside the reset email, so a leaked database row is useless.
   */
  @Prop({ index: true })
  passwordResetToken?: string;

  @Prop()
  passwordResetExpires?: Date;

  /** External account id when the user signs in with Google. */
  @Prop({ index: true, sparse: true })
  googleId?: string;

  /** External account id when the user signs in with Facebook. */
  @Prop({ index: true, sparse: true })
  facebookId?: string;

  // ---- Two-factor authentication (authenticator app) ----
  // The secret fields are select:false so they never reach API responses;
  // TwoFactorService selects them explicitly when it needs them.

  @Prop({ default: false })
  twoFactorEnabled: boolean;

  /** The active TOTP secret, AES-256-GCM encrypted (see two-factor/totp.ts). */
  @Prop({ select: false })
  twoFactorSecret?: string;

  /** A secret shown during setup that becomes active once a code confirms it. */
  @Prop({ select: false })
  twoFactorPendingSecret?: string;

  @Prop({ select: false })
  twoFactorPendingExpires?: Date;

  /** SHA-256 digests of the unused one-time recovery codes. */
  @Prop({ type: [String], select: false, default: undefined })
  twoFactorRecoveryCodes?: string[];

  /** Time step of the last accepted code, so a code can't be used twice. */
  @Prop({ select: false })
  twoFactorLastUsedStep?: number;

  /** Wrong codes in a row; reaching the limit locks 2FA checks for a while. */
  @Prop({ select: false, default: 0 })
  twoFactorFailedAttempts?: number;

  @Prop({ select: false })
  twoFactorLockedUntil?: Date;

  @Prop({ type: UserSettingsSchema, default: () => ({}) })
  settings: UserSettings;

  // Community reputation: average of post-hangout ratings (0 until the first rating)
  @Prop({ default: 0 })
  ratingAvg: number;

  @Prop({ default: 0 })
  ratingCount: number;

  // Badges earned (rules live in RatingsService.recomputeReputation)
  @Prop({ type: [UserBadgeSchema], default: [] })
  badges: UserBadge[];

  // ---- Account deletion (grace period) ----
  // The account is deactivated immediately but only purged after the grace
  // period, so a mistaken deletion can be undone from the emailed link.

  /** When the user asked to delete their account. */
  @Prop()
  deletionRequestedAt?: Date;

  /** When the account is permanently purged (requestedAt + grace period). */
  @Prop({ index: true, sparse: true })
  deletionScheduledFor?: Date;

  /** SHA-256 digest of the one-time token that cancels a pending deletion. */
  @Prop()
  deletionCancelToken?: string;

  @Prop()
  deletionCancelExpires?: Date;

  /** Set when the purge has begun, so a pending purge runs at most once. */
  @Prop()
  purgeStartedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
