import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { AuthService } from './auth.service';
import type { StateStore } from 'passport-oauth2';
import { OAuthCookieStateStore } from './oauth-state.store';

/**
 * Google OAuth2 sign-in. The strategy is always registered so the routes
 * exist, but it holds placeholder client credentials until they are provided
 * in the environment; the GoogleEnabledGuard rejects the routes with a clear
 * 503 before this strategy is ever exercised.
 */
// @Injectable is required so Nest can inject AuthService and ConfigService
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private authService: AuthService,
    config: ConfigService,
  ) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID') ?? '';
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET') ?? '';
    const callbackURL = config.get<string>('GOOGLE_CALLBACK_URL') ?? '';

    super({
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL: callbackURL || 'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
      // Protects against login CSRF without server sessions
      store: new OAuthCookieStateStore('google') as unknown as StateStore,
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile) {
    const email = profile.emails?.[0];
    return this.authService.signInWithSocial({
      provider: 'google',
      providerId: profile.id,
      email: email?.value ?? null,
      // Google accounts can carry an address the owner never confirmed
      emailVerified:
        (email as { verified?: boolean } | undefined)?.verified === true ||
        (profile._json as { email_verified?: boolean }).email_verified === true,
      name: profile.displayName,
    });
  }
}
