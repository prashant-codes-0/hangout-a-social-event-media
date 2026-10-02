import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { Message, MessageSchema } from './schemas/message.schema';
import { Hangout, HangoutSchema } from '../hangouts/schemas/hangout.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { PrivateChat, PrivateChatSchema } from './schemas/private-chat.schema';
import { PrivateMessage, PrivateMessageSchema } from './schemas/private-message.schema';
import { PrivateChatService } from './private-chat.service';
import { PrivateChatController } from './private-chat.controller';
import { IceServersService } from './ice-servers.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: Hangout.name, schema: HangoutSchema },
      { name: User.name, schema: UserSchema },
      { name: PrivateChat.name, schema: PrivateChatSchema },
      { name: PrivateMessage.name, schema: PrivateMessageSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'your-secret-key'),
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [ChatService, ChatGateway, PrivateChatService, IceServersService],
  controllers: [ChatController, PrivateChatController],
  exports: [ChatService],
})
export class ChatModule {}