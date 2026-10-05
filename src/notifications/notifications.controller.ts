import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Your alerts, newest first (live updates arrive via the "notification" socket event)',
  })
  @ApiQuery({
    name: 'before',
    required: false,
    description: 'ISO date: return alerts older than this (pagination)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Page size (default 20, max 50)',
  })
  @ApiResponse({ status: 200, description: '{ items, hasMore }' })
  list(
    @Request() req,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.list(
      req.user.id,
      before,
      limit ? parseInt(limit) || 20 : 20,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread alerts' })
  unreadCount(@Request() req) {
    return this.notificationsService.unreadCount(req.user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all alerts as read' })
  markAllRead(@Request() req) {
    return this.notificationsService.markAllRead(req.user.id);
  }

  @Patch('read-context')
  @ApiOperation({
    summary: 'Mark message alerts for a private chat or hangout chat as read',
  })
  @ApiBody({
    schema: {
      properties: { chatId: { type: 'string' }, hangoutId: { type: 'string' } },
    },
  })
  markContextRead(
    @Request() req,
    @Body() body: { chatId?: string; hangoutId?: string },
  ) {
    return this.notificationsService.markReadByContext(req.user.id, {
      chatId: typeof body?.chatId === 'string' ? body.chatId : undefined,
      hangoutId:
        typeof body?.hangoutId === 'string' ? body.hangoutId : undefined,
    });
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one alert as read' })
  markRead(@Request() req, @Param('id') id: string) {
    return this.notificationsService.markRead(req.user.id, id);
  }
}
