import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'your-secret-key'),
    });
  }

  async validate(payload: { sub: string; purpose?: string }) {
    // Purpose tokens (e.g. the 2FA sign-in challenge) share the signing key but
    // are not sessions: they only unlock their own endpoint.
    if (payload?.purpose) {
      throw new UnauthorizedException();
    }
    const user = await this.authService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    // Accounts pending deletion are deactivated: every session is refused
    // until the deletion is cancelled from the emailed link.
    if (user.deletionScheduledFor) {
      throw new UnauthorizedException(
        'This account is scheduled for deletion. Check your email to cancel it.',
      );
    }
    return user;
  }
}
