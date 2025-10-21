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

  @UseGuards(AuthGuard('jwt'))
  @Post('message')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Send a message to hangout chat' })
  @ApiResponse({
    status: 201,
    description: 'Message sent successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'You must be an attendee to send messages' })
  @ApiResponse({ status: 404, description: 'Hangout not found' })
  @ApiBody({ type: SendMessageDto })
  async sendMessage(@Body() sendMessageDto: SendMessageDto, @Request() req) {
    return this.chatService.sendMessage(sendMessageDto, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('hangout/:hangoutId/messages')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get messages for a hangout chat' })
  @ApiParam({ name: 'hangoutId', description: 'Hangout ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of messages to fetch (default: 50)' })
  @ApiQuery({ name: 'skip', required: false, description: 'Number of messages to skip (default: 0)' })
  @ApiResponse({
    status: 200,
    description: 'Messages retrieved successfully',
    type: [MessageResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'You must be an attendee to view messages' })
  @ApiResponse({ status: 404, description: 'Hangout not found' })
  async getMessages(
    @Param('hangoutId') hangoutId: string,
    @Request() req,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
  ) {
    return this.chatService.getMessages(
      hangoutId,
      req.user.id,
      limit ? parseInt(limit.toString()) : 50,
      skip ? parseInt(skip.toString()) : 0,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('message/:messageId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Edit your own message' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  @ApiResponse({
    status: 200,
    description: 'Message edited successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'You can only edit your own messages' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  @ApiBody({ type: EditMessageDto })
  async editMessage(
    @Param('messageId') messageId: string,
    @Body() editMessageDto: EditMessageDto,
    @Request() req,
  ) {
    return this.chatService.editMessage(messageId, editMessageDto, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('message/:messageId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete your own message' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  @ApiResponse({ status: 200, description: 'Message deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'You can only delete your own messages' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async deleteMessage(@Param('messageId') messageId: string, @Request() req) {
    return this.chatService.deleteMessage(messageId, req.user.id);
  }
}