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

  @Prop({ type: UserSettingsSchema, default: () => ({}) })
  settings: UserSettings;
}

export const UserSchema = SchemaFactory.createForClass(User);
