import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';
import { AuthService } from './auth.service';
import type { StateStore } from 'passport-oauth2';
import { OAuthCookieStateStore } from './oauth-state.store';

/**
 * Facebook OAuth2 sign-in. The strategy is always registered so the routes
 * exist, but it holds placeholder client credentials until they are provided
 * in the environment; the FacebookEnabledGuard rejects the routes with a
 * clear 503 before this strategy is ever exercised.
 */
// @Injectable is required so Nest can inject AuthService and ConfigService
@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(
    private authService: AuthService,
    config: ConfigService,
  ) {
    const clientID = config.get<string>('FACEBOOK_APP_ID') ?? '';
    const clientSecret = config.get<string>('FACEBOOK_APP_SECRET') ?? '';
    const callbackURL = config.get<string>('FACEBOOK_CALLBACK_URL') ?? '';

    super({
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL:
        callbackURL || 'http://localhost:3000/auth/facebook/callback',
      profileFields: ['id', 'displayName', 'emails', 'name'],
      scope: ['email'],
      // Protects against login CSRF without server sessions
      store: new OAuthCookieStateStore('facebook') as unknown as StateStore,
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile) {
    return this.authService.signInWithSocial({
      provider: 'facebook',
      providerId: profile.id,
      email: profile.emails?.[0]?.value ?? null,
      // Facebook only returns an email address the user has confirmed
      emailVerified: !!profile.emails?.[0]?.value,
      name: profile.displayName || profile.name?.givenName || null,
    });
  }
}
