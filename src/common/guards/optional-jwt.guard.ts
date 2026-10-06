import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Lets anonymous callers through while still attaching request.user when a
// valid token is present, so endpoints can personalise their response.
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    return user || true;
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}