import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HangoutsService } from './hangouts.service';
import { HangoutsController } from './hangouts.controller';
import { HangoutsScheduler } from './hangouts.scheduler';
import { CheckInService } from './checkin.service';
import { RatingsService } from './ratings.service';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { Hangout, HangoutSchema } from './schemas/hangout.schema';
import {
  HangoutCheckIn,
  HangoutCheckInSchema,
} from './schemas/hangout-checkin.schema';
import {
  HangoutRating,
  HangoutRatingSchema,
} from './schemas/hangout-rating.schema';
import { JoinRequest, JoinRequestSchema } from './schemas/join-request.schema';
import {
  HangoutTicket,
  HangoutTicketSchema,
} from './schemas/hangout-ticket.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Hangout.name, schema: HangoutSchema },
      { name: HangoutCheckIn.name, schema: HangoutCheckInSchema },
      { name: HangoutRating.name, schema: HangoutRatingSchema },
      { name: JoinRequest.name, schema: JoinRequestSchema },
      { name: HangoutTicket.name, schema: HangoutTicketSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
    SocialModule,
  ],
  providers: [
    HangoutsService,
    HangoutsScheduler,
    CheckInService,
    RatingsService,
    TicketsService,
  ],
  controllers: [HangoutsController, TicketsController],
  exports: [RatingsService],
})
export class HangoutsModule {}
