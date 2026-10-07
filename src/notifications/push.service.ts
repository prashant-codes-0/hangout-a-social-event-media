import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as webpush from 'web-push';
import { PushSubscriptionDto } from './dto/push-subscription.dto';
import { PushSubscription } from './schemas/push-subscription.schema';

// What the service worker receives (see hangout-angular/public/push-sw.js)
export interface PushPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  tag: string; // a newer push with the same tag replaces the older notification
  count?: number;
  callType?: 'audio' | 'video';
}

const TTL_SECONDS = 24 * 60 * 60; // the push service drops it if the device stays offline longer
const URGENT_TYPES = new Set([
  'private_message',
  'group_message',
  'missed_call',
  'chat_request',
]);

// Web Push delivery. Off (and harmless) until VAPID keys are configured.
// Never throws: a failed push must not break the alert or the action behind it.
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly vapidPublicKey: string | null = null;

  constructor(
    @InjectModel(PushSubscription.name)
    private subscriptionModel: Model<PushSubscription>,
    config: ConfigService,
  ) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY');
    const subject =
      config.get<string>('VAPID_SUBJECT') || 'mailto:admin@example.com';

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'Push notifications are off: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY',
      );
      return;
    }
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidPublicKey = publicKey;
    } catch (error) {
      this.logger.error(
        `Push notifications are off: invalid VAPID settings (${(error as Error).message})`,
      );
    }
  }

  isEnabled(): boolean {
    return this.vapidPublicKey !== null;
  }

  config() {
    return { enabled: this.isEnabled(), publicKey: this.vapidPublicKey };
  }

  // Upsert by endpoint: re-subscribing refreshes the keys, and a shared browser moves to the
  // account that is signed in now
  async subscribe(
    userId: string,
    dto: PushSubscriptionDto,
    userAgent?: string,
  ) {
    await this.subscriptionModel.updateOne(
      { endpoint: dto.endpoint },
      {
        $set: {
          userId,
          keys: { p256dh: dto.keys.p256dh, auth: dto.keys.auth },
          userAgent: userAgent?.slice(0, 300),
        },
      },
      { upsert: true },
    );
    return { subscribed: true };
  }

  // Only the owner can remove a subscription
  async unsubscribe(userId: string, endpoint: string) {
    const result = await this.subscriptionModel.deleteOne({ endpoint, userId });
    return { removed: result.deletedCount > 0 };
  }

  async sendToUser(userId: string, payload: PushPayload) {
    if (!this.isEnabled()) return { sent: 0 };
    try {
      const subscriptions = await this.subscriptionModel
        .find({ userId })
        .lean()
        .exec();
      const body = JSON.stringify(payload);
      const options: webpush.RequestOptions = {
        TTL: TTL_SECONDS,
        urgency: URGENT_TYPES.has(payload.type) ? 'high' : 'normal',
        topic: topicFor(payload.tag), // lets the push service collapse queued duplicates
      };

      const results = await Promise.allSettled(
        subscriptions.map((sub) =>
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            body,
            options,
          ),
        ),
      );

      let sent = 0;
      const delivered: string[] = [];
      const gone: string[] = [];
      results.forEach((result, i) => {
        const endpoint = subscriptions[i].endpoint;
        if (result.status === 'fulfilled') {
          sent++;
          delivered.push(endpoint);
          return;
        }
        const status = (result.reason as webpush.WebPushError)?.statusCode;
        if (status === 404 || status === 410) {
          gone.push(endpoint); // the browser unsubscribed or the subscription expired
        } else {
          this.logger.warn(
            `Push to ${userId} failed (${status ?? 'network'}): ${(result.reason as Error)?.message}`,
          );
        }
      });

      if (gone.length)
        await this.subscriptionModel.deleteMany({ endpoint: { $in: gone } });
      if (delivered.length) {
        await this.subscriptionModel.updateMany(
          { endpoint: { $in: delivered } },
          { $set: { lastSuccessAt: new Date() } },
        );
      }
      return { sent, removed: gone.length };
    } catch (error) {
      this.logger.error(
        `Push to ${userId} failed: ${(error as Error).message}`,
      );
      return { sent: 0 };
    }
  }
}

// Web Push topics: at most 32 chars from the URL-safe base64 alphabet
function topicFor(tag: string): string {
  return tag.replace(/[^A-Za-z0-9_-]/g, '').slice(-32);
}
