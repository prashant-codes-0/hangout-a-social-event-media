import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HangoutsService } from './hangouts.service';
import { HangoutsController } from './hangouts.controller';
import { Hangout, HangoutSchema } from './schemas/hangout.schema';
import { JoinRequest, JoinRequestSchema } from './schemas/join-request.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Hangout.name, schema: HangoutSchema },
      { name: JoinRequest.name, schema: JoinRequestSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [HangoutsService],
  controllers: [HangoutsController],
})
export class HangoutsModule {}