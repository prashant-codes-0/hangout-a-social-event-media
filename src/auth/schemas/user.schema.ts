import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SPONSOR = 'sponsor',
}

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
    default: UserRole.USER 
  })
  role: UserRole;

  @Prop({ default: false })
  verified: boolean;

  @Prop()
  otpCode?: string;

  @Prop()
  otpExpiry?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);