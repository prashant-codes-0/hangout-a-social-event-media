import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Hangout, HangoutSchema } from '../hangouts/schemas/hangout.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityService } from './activity.service';
import { Activity, ActivitySchema } from './schemas/activity.schema';
import { Follow, FollowSchema } from './schemas/follow.schema';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

// Following, public profiles and the activity feed. HangoutsModule imports this to record
// activity and to show "friends going"; this module only reads hangouts (no import back).
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Follow.name, schema: FollowSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: User.name, schema: UserSchema },
      { name: Hangout.name, schema: HangoutSchema },
    ]),
    NotificationsModule,
  ],
  providers: [SocialService, ActivityService],
  controllers: [SocialController],
  exports: [SocialService, ActivityService],
})
export class SocialModule {}
