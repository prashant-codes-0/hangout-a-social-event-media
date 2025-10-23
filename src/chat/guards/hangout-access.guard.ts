import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Hangout } from '../../hangouts/schemas/hangout.schema';
import { User, UserRole } from '../../auth/schemas/user.schema';

@Injectable()
export class HangoutAccessGuard implements CanActivate {
  constructor(
    @InjectModel(Hangout.name)
    private hangoutModel: Model<Hangout>,
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Get hangout ID from route params or request body
    const hangoutId = request.params.hangoutId || request.params.id || request.body?.hangoutId;
    
    if (!hangoutId) {
      throw new ForbiddenException('Hangout ID is required');
    }

    // Check if hangout exists
    const hangout = await this.hangoutModel.findById(hangoutId);
    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    // Get user details for role checking
    const userDetails = await this.userModel.findById(user.id);
    if (!userDetails) {
      throw new ForbiddenException('User not found');
    }

    // Check access permissions
    const isAdmin = userDetails.role === UserRole.ADMIN;
    const isCreator = hangout.createdBy.toString() === user.id;
    const isAttendee = hangout.attendees.some(
      attendeeId => attendeeId.toString() === user.id
    );

    if (!isAdmin && !isCreator && !isAttendee) {
      throw new ForbiddenException('You must be an attendee, creator, or admin to access this hangout');
    }

    // Add hangout to request for use in controllers
    request.hangout = hangout;
    
    return true;
  }
}