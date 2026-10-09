import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServer[];
  ttlSeconds: number;
  relay: boolean; // whether a TURN relay is configured (needed for calls across different networks)
}

// How long issued TURN credentials stay valid; calls must start within this window
const CREDENTIAL_TTL_SECONDS = 6 * 60 * 60;

const DEFAULT_STUN: IceServer = {
  urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
};

// WebRTC ICE servers for private-chat calls.
//
// STUN alone only connects peers whose networks allow a direct path (same Wi-Fi, many home
// routers). Mobile carriers and strict NAT/firewalls need a TURN relay. TURN credentials are
// issued here, short-lived and only to logged-in users, so they never ship in the frontend.
//
// Configure ONE of (see .env.example):
//   1. Cloudflare TURN:  CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN
//   2. coturn:           TURN_URLS + TURN_SECRET   (coturn `use-auth-secret` / `static-auth-secret`)
//   3. Static login:     TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL (e.g. Metered, Twilio)
@Injectable()
export class IceServersService {
  private readonly logger = new Logger(IceServersService.name);

  constructor(private config: ConfigService) {}

  async getIceServers(userId: string): Promise<IceServersResponse> {
    try {
      const turn = await this.getTurnServers(userId);
      if (turn.length > 0) {
        return {
          iceServers: [DEFAULT_STUN, ...turn],
          ttlSeconds: CREDENTIAL_TTL_SECONDS,
          relay: true,
        };
      }
    } catch (error) {
      // Fall back to STUN so calls on friendly networks still work
      this.logger.error(
        `Could not get TURN credentials: ${(error as Error).message}`,
      );
    }
    return {
      iceServers: [DEFAULT_STUN],
      ttlSeconds: CREDENTIAL_TTL_SECONDS,
      relay: false,
    };
  }

  private async getTurnServers(userId: string): Promise<IceServer[]> {
    const cfKeyId = this.config.get<string>('CLOUDFLARE_TURN_KEY_ID');
    const cfToken = this.config.get<string>('CLOUDFLARE_TURN_API_TOKEN');
    if (cfKeyId && cfToken) {
      return this.cloudflare(cfKeyId, cfToken);
    }

    const urls = this.turnUrls();
    if (urls.length === 0) return [];

    const secret = this.config.get<string>('TURN_SECRET');
    if (secret) {
      // TURN REST API scheme: username = "<expiry>:<user>", credential = base64(HMAC-SHA1(secret, username))
      const username = `${Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS}:${userId}`;
      const credential = createHmac('sha1', secret)
        .update(username)
        .digest('base64');
      return [{ urls, username, credential }];
    }

    const username = this.config.get<string>('TURN_USERNAME');
    const credential = this.config.get<string>('TURN_CREDENTIAL');
    if (username && credential) {
      return [{ urls, username, credential }];
    }

    this.logger.warn(
      'TURN_URLS is set but neither TURN_SECRET nor TURN_USERNAME/TURN_CREDENTIAL are',
    );
    return [];
  }

  private async cloudflare(keyId: string, token: string): Promise<IceServer[]> {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
      },
    );
    if (!response.ok) {
      throw new Error(`Cloudflare TURN responded ${response.status}`);
    }

    const data = await response.json();
    const servers: IceServer[] = Array.isArray(data.iceServers)
      ? data.iceServers
      : [data.iceServers];

    // Browsers block port 53, and those URLs just time out (per Cloudflare's docs)
    return servers
      .map((server) => ({
        ...server,
        urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(
          (url) => !/:53(\?|$)/.test(url),
        ),
      }))
      .filter((server) => server.urls.length > 0 && server.username);
  }

  private turnUrls(): string[] {
    return (this.config.get<string>('TURN_URLS') || '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
  }
}
