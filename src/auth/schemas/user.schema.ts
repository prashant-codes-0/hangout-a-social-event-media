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
}

export const UserSchema = SchemaFactory.createForClass(User);
