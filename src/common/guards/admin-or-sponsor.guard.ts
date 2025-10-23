import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../auth/schemas/user.schema';

@Injectable()
export class AdminOrSponsorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const isAdminOrSponsor = user.role === UserRole.ADMIN || user.role === UserRole.SPONSOR;

    if (!isAdminOrSponsor) {
      throw new ForbiddenException('Admin or sponsor access required');
    }

    return true;
  }
}