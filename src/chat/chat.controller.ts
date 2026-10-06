import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { HangoutAccessGuard } from './guards/hangout-access.guard';
import { UserRole } from '../auth/schemas/user.schema';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { SendMessageDto, EditMessageDto, MessageResponseDto, ReactDto, MarkReadDto } from './dto/chat.dto';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) { }

  @UseGuards(AuthGuard('jwt'), HangoutAccessGuard)
  @Post('message')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Send a message to hangout chat' })
  @ApiResponse({
    status: 201,
    description: 'Message sent successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'You must be an attendee, creator, or admin to send messages' })
  @ApiResponse({ status: 404, description: 'Hangout not found' })
  @ApiBody({ type: SendMessageDto })
  async sendMessage(@Body() sendMessageDto: SendMessageDto, @Request() req) {
    const message = await this.chatService.sendMessage(sendMessageDto, req.user.id);
    // Alert members who aren't looking at this chat (fire and forget)
    this.chatService.notifyGroupMessage(message, req.user.id);
    return message;
  }

  @UseGuards(AuthGuard('jwt'), HangoutAccessGuard)
  @Get('hangout/:hangoutId/messages')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get messages for a hangout chat' })
  @ApiParam({ name: 'hangoutId', description: 'Hangout ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of messages to fetch (default: 50)' })
  @ApiQuery({ name: 'skip', required: false, description: 'Number of messages to skip (default: 0)' })
  @ApiQuery({ name: 'restrictHistory', required: false, description: 'Only show recent messages (default: false)' })
  @ApiResponse({
    status: 200,
    description: 'Messages retrieved successfully',
    type: [MessageResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'You must be an attendee, creator, or admin to view messages' })
  @ApiResponse({ status: 404, description: 'Hangout not found' })
  async getMessages(
    @Param('hangoutId') hangoutId: string,
    @Request() req,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
    @Query('restrictHistory') restrictHistory?: string,
  ) {
    // Access already validated by HangoutAccessGuard
    return this.chatService.getMessages(
      hangoutId,
      req.user.id,
      limit ? parseInt(limit.toString()) : 50,
      skip ? parseInt(skip.toString()) : 0,
      restrictHistory === 'true',
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('message/:messageId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Edit message (your own or admin can edit any)' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  @ApiResponse({
    status: 200,
    description: 'Message edited successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'You can only edit your own messages (unless you are an admin)' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  @ApiBody({ type: EditMessageDto })
  async editMessage(
    @Param('messageId') messageId: string,
    @Body() editMessageDto: EditMessageDto,
    @Request() req,
  ) {
    const isAdmin = req.user.role === UserRole.ADMIN;
    return this.chatService.editMessage(messageId, editMessageDto, req.user.id, isAdmin);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('message/:messageId/pin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Pin or unpin a group message (hangout organizer or admin; max 3, oldest is replaced)' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  @ApiBody({ schema: { properties: { pinned: { type: 'boolean', example: true } } } })
  @ApiResponse({ status: 200, description: '{ hangoutId, messageId, pinned, pinnedMessage, unpinnedMessageIds }' })
  @ApiResponse({ status: 403, description: 'Only the hangout organizer can pin messages' })
  async pinMessage(@Param('messageId') messageId: string, @Body('pinned') pinned: boolean, @Request() req) {
    if (typeof pinned !== 'boolean') {
      throw new BadRequestException('pinned must be true or false');
    }
    const isAdmin = req.user.role === UserRole.ADMIN;
    return this.chatService.setPinned(messageId, req.user.id, pinned, isAdmin);
  }

  @UseGuards(AuthGuard('jwt'), HangoutAccessGuard)
  @Get('hangout/:hangoutId/pinned')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Pinned messages of a hangout chat, newest pin first' })
  @ApiParam({ name: 'hangoutId', description: 'Hangout ID' })
  async getPinned(@Param('hangoutId') hangoutId: string) {
    return this.chatService.getPinned(hangoutId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('message/:messageId/reactions')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Toggle your reaction (one emoji) on a group message' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  @ApiBody({ type: ReactDto })
  @ApiResponse({ status: 200, description: '{ hangoutId, messageId, reactions: { emoji: userIds[] } }' })
  @ApiResponse({ status: 400, description: 'Not a single emoji, or too many different reactions' })
  @ApiResponse({ status: 403, description: 'Not part of this hangout' })
  async react(@Param('messageId') messageId: string, @Body() dto: ReactDto, @Request() req) {
    return this.chatService.toggleReaction(messageId, req.user.id, dto.emoji);
  }

  @UseGuards(AuthGuard('jwt'), HangoutAccessGuard)
  @Post('hangout/:hangoutId/read')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Mark messages up to and including the given one as read (read receipts)' })
  @ApiParam({ name: 'hangoutId', description: 'Hangout ID' })
  @ApiBody({ type: MarkReadDto })
  @ApiResponse({ status: 201, description: '{ updated: number }' })
  async markRead(@Param('hangoutId') hangoutId: string, @Body() dto: MarkReadDto, @Request() req) {
    return this.chatService.markRead(hangoutId, req.user.id, dto.upToMessageId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('message/:messageId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete message (your own or admin can delete any)' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  @ApiResponse({ status: 200, description: 'Message deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'You can only delete your own messages (unless you are an admin)' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async deleteMessage(@Param('messageId') messageId: string, @Request() req) {
    const isAdmin = req.user.role === UserRole.ADMIN;
    return this.chatService.deleteMessage(messageId, req.user.id, isAdmin);
  }

  @UseGuards(AuthGuard('jwt'), HangoutAccessGuard)
  @Get('hangout/:hangoutId/recent-messages')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get recent messages for a hangout (last 24 hours)' })
  @ApiParam({ name: 'hangoutId', description: 'Hangout ID' })
  @ApiQuery({ name: 'hours', required: false, description: 'Hours to look back (default: 24)' })
  @ApiResponse({
    status: 200,
    description: 'Recent messages retrieved successfully',
    type: [MessageResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'You must be an attendee, creator, or admin to view messages' })
  @ApiResponse({ status: 404, description: 'Hangout not found' })
  async getRecentMessages(
    @Param('hangoutId') hangoutId: string,
    @Request() req,
    @Query('hours') hours?: number,
  ) {
    // Access already validated by HangoutAccessGuard
    return this.chatService.getRecentMessages(
      hangoutId,
      req.user.id,
      hours ? parseInt(hours.toString()) : 24,
    );
  }
}