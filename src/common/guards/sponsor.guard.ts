import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../auth/schemas/user.schema';

@Injectable()
export class SponsorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.role !== UserRole.SPONSOR) {
      throw new ForbiddenException('Sponsor access required');
    }

    return true;
  }
}