import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class PushKeys {
  @Prop({ required: true })
  p256dh: string;

  @Prop({ required: true })
  auth: string;
}

const PushKeysSchema = SchemaFactory.createForClass(PushKeys);

// One browser that agreed to receive Web Push for a user. The endpoint is unique: when someone
// else signs in on the same browser and subscribes, the subscription moves to them.
@Schema({ timestamps: true })
export class PushSubscription extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  // Push service URL for this browser (FCM, Mozilla autopush, ...)
  @Prop({ required: true, unique: true })
  endpoint: string;

  @Prop({ type: PushKeysSchema, required: true })
  keys: PushKeys;

  @Prop()
  userAgent?: string;

  // Last time the push service accepted a message for this browser
  @Prop()
  lastSuccessAt?: Date;
}

export const PushSubscriptionSchema =
  SchemaFactory.createForClass(PushSubscription);
