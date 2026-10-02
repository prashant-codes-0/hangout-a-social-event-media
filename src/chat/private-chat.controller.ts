import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PrivateChatService } from './private-chat.service';
import { ChatGateway } from './chat.gateway';
import {
  RequestPrivateChatDto,
  RespondPrivateChatDto,
  SendPrivateMessageDto,
} from './dto/private-chat.dto';

@ApiTags('Private Chat')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('chat/private')
export class PrivateChatController {
  constructor(
    private readonly privateChatService: PrivateChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Post('request')
  @ApiOperation({ summary: 'Request a private chat with another member of a hangout' })
  @ApiBody({ type: RequestPrivateChatDto })
  @ApiResponse({ status: 201, description: 'Private chat requested (or existing chat returned)' })
  @ApiResponse({ status: 400, description: 'Invalid recipient' })
  @ApiResponse({ status: 403, description: 'You must be part of the hangout' })
  async requestChat(@Body() dto: RequestPrivateChatDto, @Request() req) {
    const chat = await this.privateChatService.requestChat(dto.hangoutId, req.user.id, dto.recipientId);
    this.chatGateway.emitToUsers(this.privateChatService.getParticipantIds(chat), 'privateChatUpdated', chat);
    return chat;
  }

  @Patch(':chatId/respond')
  @ApiOperation({ summary: 'Accept or decline a private chat request' })
  @ApiParam({ name: 'chatId', description: 'Private chat ID' })
  @ApiBody({ type: RespondPrivateChatDto })
  @ApiResponse({ status: 200, description: 'Request answered' })
  @ApiResponse({ status: 403, description: 'Only the recipient can respond' })
  async respond(@Param('chatId') chatId: string, @Body() dto: RespondPrivateChatDto, @Request() req) {
    const chat = await this.privateChatService.respondToRequest(chatId, req.user.id, dto.accept);
    this.chatGateway.emitToUsers(this.privateChatService.getParticipantIds(chat), 'privateChatUpdated', chat);
    return chat;
  }

  @Get('presence')
  @ApiOperation({ summary: 'Online/offline status of users (live updates arrive via the presenceChanged socket event)' })
  @ApiQuery({ name: 'userIds', required: true, description: 'Comma-separated user IDs (max 200)' })
  @ApiResponse({ status: 200, description: 'Presence per user: { userId, online, lastSeen }' })
  getPresence(@Query('userIds') userIds?: string) {
    const ids = (userIds || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
      .slice(0, 200);
    return this.chatGateway.getPresence(ids);
  }

  @Get('hangout/:hangoutId')
  @ApiOperation({ summary: 'List your private chats and requests within a hangout' })
  @ApiParam({ name: 'hangoutId', description: 'Hangout ID' })
  @ApiResponse({ status: 200, description: 'Private chats retrieved' })
  async getChatsForHangout(@Param('hangoutId') hangoutId: string, @Request() req) {
    return this.privateChatService.getChatsForHangout(hangoutId, req.user.id);
  }

  @Get(':chatId/messages')
  @ApiOperation({ summary: 'Get messages of an accepted private chat' })
  @ApiParam({ name: 'chatId', description: 'Private chat ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of messages (default: 50)' })
  @ApiQuery({ name: 'skip', required: false, description: 'Messages to skip (default: 0)' })
  @ApiResponse({ status: 200, description: 'Messages retrieved (oldest first)' })
  @ApiResponse({ status: 403, description: 'Not a participant or chat not accepted' })
  async getMessages(
    @Param('chatId') chatId: string,
    @Request() req,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.privateChatService.getMessages(
      chatId,
      req.user.id,
      limit ? parseInt(limit) : 50,
      skip ? parseInt(skip) : 0,
    );
  }

  @Post(':chatId/messages')
  @ApiOperation({ summary: 'Send a message in an accepted private chat' })
  @ApiParam({ name: 'chatId', description: 'Private chat ID' })
  @ApiBody({ type: SendPrivateMessageDto })
  @ApiResponse({ status: 201, description: 'Message sent' })
  @ApiResponse({ status: 403, description: 'Not a participant or chat not accepted' })
  async sendMessage(@Param('chatId') chatId: string, @Body() dto: SendPrivateMessageDto, @Request() req) {
    const { chat, message } = await this.privateChatService.sendMessage(chatId, req.user.id, dto.content);
    this.chatGateway.emitToUsers(this.privateChatService.getParticipantIds(chat), 'newPrivateMessage', message);
    return message;
  }
}
