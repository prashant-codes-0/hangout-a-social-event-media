import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../auth/schemas/user.schema';

@Injectable()
export class VerifiedUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Allow verified users, admins, and sponsors
    const canCreateHangouts = user.verified || 
                             user.role === UserRole.ADMIN || 
                             user.role === UserRole.SPONSOR;

    if (!canCreateHangouts) {
      throw new ForbiddenException('Only verified users, admins, and sponsors can perform this action');
    }

    return true;
  }
}