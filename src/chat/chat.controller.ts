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
import { SendMessageDto, EditMessageDto, MessageResponseDto } from './dto/chat.dto';

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
    return this.chatService.sendMessage(sendMessageDto, req.user.id);
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