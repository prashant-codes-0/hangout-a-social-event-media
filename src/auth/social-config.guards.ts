import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  Type,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

const providerLabel = (provider: 'google' | 'facebook'): string =>
  provider === 'google' ? 'Google' : 'Facebook';

const idEnv = (provider: 'google' | 'facebook'): string =>
  provider === 'google' ? 'GOOGLE_CLIENT_ID' : 'FACEBOOK_APP_ID';

const secretEnv = (provider: 'google' | 'facebook'): string =>
  provider === 'google' ? 'GOOGLE_CLIENT_SECRET' : 'FACEBOOK_APP_SECRET';

function makeSocialEnabledGuard(provider: 'google' | 'facebook') {
  @Injectable()
  class SocialEnabledGuard implements CanActivate {
    constructor(private config: ConfigService) {}

    canActivate(): boolean {
      const id = this.config.get<string>(idEnv(provider));
      const secret = this.config.get<string>(secretEnv(provider));
      if (!id || !secret) {
        throw new ServiceUnavailableException(
          `${providerLabel(provider)} sign-in is not configured. Set ${idEnv(provider)} and ${secretEnv(provider)} in the server environment.`,
        );
      }
      return true;
    }
  }
  return SocialEnabledGuard;
}

/** Request seen by the OAuth callback handlers. */
export interface SocialCallbackRequest {
  user?: { access_token?: string; twoFactorToken?: string } | null;
  socialError?: string;
}

/**
 * Passport guard for the provider's callback that never throws: a failed or
 * cancelled sign-in leaves `req.user` empty and puts a readable reason in
 * `req.socialError`, so the controller can send the browser back to the app
 * instead of showing raw JSON on the API's domain.
 */
function makeSocialCallbackGuard(provider: 'google' | 'facebook') {
  @Injectable()
  class SocialCallbackGuard extends AuthGuard(provider) {
    handleRequest<TUser>(
      err: unknown,
      user: TUser,
      info: unknown,
      context: ExecutionContext,
    ): TUser {
      if (err || !user) {
        const req = context.switchToHttp().getRequest<SocialCallbackRequest>();
        req.socialError = socialErrorMessage(provider, err, info, req);
        return null as TUser;
      }
      return user;
    }
  }
  return SocialCallbackGuard;
}

function socialErrorMessage(
  provider: 'google' | 'facebook',
  err: unknown,
  info: unknown,
  req: unknown,
): string {
  const query = (req as { query?: Record<string, string> }).query ?? {};
  // The person pressed "Cancel" / "Not now" on the provider's consent screen
  if (query.error === 'access_denied' || query.error_reason === 'user_denied') {
    return `${providerLabel(provider)} sign-in was cancelled.`;
  }
  if (err instanceof HttpException) return err.message;
  const infoMessage = (info as { message?: string } | undefined)?.message;
  if (infoMessage && !/^Unable to verify authorization request state/i.test(infoMessage)) {
    return infoMessage;
  }
  if (infoMessage) {
    return 'Your sign-in session expired or was started elsewhere. Please try again.';
  }
  return `${providerLabel(provider)} sign-in failed. Please try again.`;
}

/** Callback guard for Google: see makeSocialCallbackGuard. */
export const GoogleCallbackGuard: Type<CanActivate> = makeSocialCallbackGuard('google');

/** Callback guard for Facebook: see makeSocialCallbackGuard. */
export const FacebookCallbackGuard: Type<CanActivate> = makeSocialCallbackGuard('facebook');

/** Runs before AuthGuard('google') so an unconfigured Google login returns a clear 503 instead of a broken redirect. */
export const GoogleEnabledGuard: Type<CanActivate> =
  makeSocialEnabledGuard('google');

/** Runs before AuthGuard('facebook') so an unconfigured Facebook login returns a clear 503 instead of a broken redirect. */
export const FacebookEnabledGuard: Type<CanActivate> =
  makeSocialEnabledGuard('facebook');
