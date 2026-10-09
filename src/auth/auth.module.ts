import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AccountService } from './account/account.service';
import { AccountController } from './account/account.controller';
import { AccountDeletionScheduler } from './account/account.scheduler';
import { User, UserSchema } from './schemas/user.schema';
import { JwtStrategy } from './jwt.strategy';
import { LocalStrategy } from './local.strategy';
import { GoogleStrategy } from './google.strategy';
import { FacebookStrategy } from './facebook.strategy';
import {
  GoogleEnabledGuard,
  FacebookEnabledGuard,
} from './social-config.guards';
import { EmailService } from '../common/services/email.service';
import { TwoFactorService } from './two-factor/two-factor.service';
import { ChatModule } from '../chat/chat.module';
import { HangoutsModule } from '../hangouts/hangouts.module';
import { Hangout, HangoutSchema } from '../hangouts/schemas/hangout.schema';
import {
  JoinRequest,
  JoinRequestSchema,
} from '../hangouts/schemas/join-request.schema';
import {
  HangoutTicket,
  HangoutTicketSchema,
} from '../hangouts/schemas/hangout-ticket.schema';
import {
  HangoutRating,
  HangoutRatingSchema,
} from '../hangouts/schemas/hangout-rating.schema';
import {
  HangoutCheckIn,
  HangoutCheckInSchema,
} from '../hangouts/schemas/hangout-checkin.schema';
import { Message, MessageSchema } from '../chat/schemas/message.schema';
import {
  PrivateChat,
  PrivateChatSchema,
} from '../chat/schemas/private-chat.schema';
import {
  PrivateMessage,
  PrivateMessageSchema,
} from '../chat/schemas/private-message.schema';
import {
  Notification,
  NotificationSchema,
} from '../notifications/schemas/notification.schema';
import {
  PushSubscription,
  PushSubscriptionSchema,
} from '../notifications/schemas/push-subscription.schema';
import { Follow, FollowSchema } from '../social/schemas/follow.schema';
import { Activity, ActivitySchema } from '../social/schemas/activity.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Hangout.name, schema: HangoutSchema },
      { name: JoinRequest.name, schema: JoinRequestSchema },
      { name: HangoutTicket.name, schema: HangoutTicketSchema },
      { name: HangoutRating.name, schema: HangoutRatingSchema },
      { name: HangoutCheckIn.name, schema: HangoutCheckInSchema },
      { name: Message.name, schema: MessageSchema },
      { name: PrivateChat.name, schema: PrivateChatSchema },
      { name: PrivateMessage.name, schema: PrivateMessageSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: PushSubscription.name, schema: PushSubscriptionSchema },
      { name: Follow.name, schema: FollowSchema },
      { name: Activity.name, schema: ActivitySchema },
    ]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'your-secret-key'),
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
    ChatModule,
    HangoutsModule,
  ],
  providers: [
    AuthService,
    TwoFactorService,
    JwtStrategy,
    LocalStrategy,
    EmailService,
    GoogleStrategy,
    FacebookStrategy,
    GoogleEnabledGuard,
    FacebookEnabledGuard,
    AccountService,
    AccountDeletionScheduler,
  ],
  controllers: [AuthController, AccountController],
  exports: [AuthService, AccountService],
})
export class AuthModule {}
