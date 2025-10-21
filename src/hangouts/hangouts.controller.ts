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
  ApiQuery
} from '@nestjs/swagger';
import { HangoutsService } from './hangouts.service';
import { CreateHangoutDto, UpdateHangoutDto } from './dto/hangout.dto';
import { HangoutResponseDto, JoinRequestResponseDto } from './dto/hangout-response.dto';
import { JoinRequestStatus } from './schemas/join-request.schema';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { AdminGuard } from '../auth/guards/admin.guard';

@ApiTags('Hangouts')
@Controller('hangouts')
export class HangoutsController {
  constructor(private readonly hangoutsService: HangoutsService) { }

  @UseGuards(AuthGuard('jwt'))
  @Post()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new hangout (verified users, admins, and sponsors only)' })
  @ApiResponse({ status: 201, description: 'Hangout successfully created', type: HangoutResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Only verified users, admins, and sponsors can create hangouts' })
  @ApiBody({ type: CreateHangoutDto })
  create(@Body() createHangoutDto: CreateHangoutDto, @Request() req) {
    return this.hangoutsService.create(createHangoutDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all public hangouts with optional filters (shows blast status if authenticated)' })
  @ApiQuery({ name: 'purpose', required: false, description: 'Filter by purpose' })
  @ApiQuery({ name: 'place', required: false, description: 'Filter by place' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by date (YYYY-MM-DD)' })
  @ApiResponse({
    status: 200,
    description: 'List of hangouts with blast status',
    type: [HangoutResponseDto]
  })
  findAll(@Query() filters: { purpose?: string; place?: string; date?: string }, @Request() req?) {
    const userId = req?.user?.id;
    return this.hangoutsService.findAll(filters, userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('my-hangouts')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get hangouts created by the current user' })
  @ApiResponse({
    status: 200,
    description: 'List of hangouts created by current user',
    type: [HangoutResponseDto]
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMyHangouts(@Request() req) {
    return this.hangoutsService.getMyHangouts(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('joined-hangouts')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get hangouts that the current user has joined (not created)' })
  @ApiResponse({
    status: 200,
    description: 'List of hangouts the user has joined',
    type: [HangoutResponseDto]
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getJoinedHangouts(@Request() req) {
    return this.hangoutsService.getJoinedHangouts(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Get('by-user/:userId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get hangouts created by a specific user (admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'List of hangouts created by the specified user',
    type: [HangoutResponseDto]
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getHangoutsByUser(@Param('userId') userId: string) {
    return this.hangoutsService.getHangoutsByUser(userId);
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Get('admin/stats')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get hangout statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'Hangout statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async getStats() {
    return this.hangoutsService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get hangout details by ID (shows if you have blasted it)' })
  @ApiParam({ name: 'id', description: 'Hangout ID' })
  @ApiResponse({
    status: 200,
    description: 'Hangout details with blast status',
    schema: {
      example: {
        success: true,
        data: {
          _id: '507f1f77bcf86cd799439011',
          title: 'Networking Night',
          blasts: 5,
          blastedBy: [
            { _id: 'user1', name: 'John Doe', email: 'john@example.com' }
          ],
          userHasBlasted: true
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Hangout not found' })
  findOne(@Param('id') id: string, @Request() req?) {
    const userId = req?.user?.id;
    return this.hangoutsService.findOne(id, userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update hangout (organizer only)' })
  @ApiParam({ name: 'id', description: 'Hangout ID' })
  @ApiResponse({ status: 200, description: 'Hangout successfully updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'You can only update your own hangouts' })
  @ApiResponse({ status: 404, description: 'Hangout not found' })
  @ApiBody({ type: UpdateHangoutDto })
  update(
    @Param('id') id: string,
    @Body() updateHangoutDto: UpdateHangoutDto,
    @Request() req,
  ) {
    return this.hangoutsService.update(id, updateHangoutDto, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete hangout (organizer only)' })
  @ApiParam({ name: 'id', description: 'Hangout ID' })
  @ApiResponse({ status: 200, description: 'Hangout successfully deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'You can only delete your own hangouts' })
  @ApiResponse({ status: 404, description: 'Hangout not found' })
  remove(@Param('id') id: string, @Request() req) {
    return this.hangoutsService.remove(id, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/join')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Request to join a hangout' })
  @ApiParam({ name: 'id', description: 'Hangout ID' })
  @ApiResponse({ status: 201, description: 'Join request successfully created', type: JoinRequestResponseDto })
  @ApiResponse({ status: 400, description: 'You already have a request for this hangout or hangout is full' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Hangout not found' })
  requestToJoin(@Param('id') id: string, @Request() req) {
    return this.hangoutsService.requestToJoin(id, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('requests/:requestId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Handle join request (organizer only)' })
  @ApiParam({ name: 'requestId', description: 'Join request ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'approved', 'rejected'],
          example: 'approved'
        }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Join request successfully handled' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'You can only handle requests for your own hangouts' })
  @ApiResponse({ status: 404, description: 'Join request not found' })
  handleJoinRequest(
    @Param('requestId') requestId: string,
    @Body('status') status: JoinRequestStatus,
    @Request() req,
  ) {
    return this.hangoutsService.handleJoinRequest(requestId, status, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/blast')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Toggle blast (upvote/downvote) for a hangout - like Reddit upvoting' })
  @ApiParam({ name: 'id', description: 'Hangout ID' })
  @ApiResponse({
    status: 200,
    description: 'Blast toggled successfully',
    schema: {
      example: {
        success: true,
        data: {
          hangoutId: '507f1f77bcf86cd799439011',
          blasts: 5,
          userBlasted: true,
          action: 'added'
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Hangout not found' })
  toggleBlast(@Param('id') id: string, @Request() req) {
    return this.hangoutsService.toggleBlast(id, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/leave')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Leave a hangout (removes from attendees and deletes join request)' })
  @ApiParam({ name: 'id', description: 'Hangout ID' })
  @ApiResponse({
    status: 200,
    description: 'Successfully left the hangout',
    schema: {
      example: {
        success: true,
        data: {
          message: 'Successfully left the hangout',
          hangoutId: '507f1f77bcf86cd799439011',
          hangoutTitle: 'Networking Night',
          remainingAttendees: 4
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'You are not an attendee of this hangout' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Hangout not found' })
  leaveHangout(@Param('id') id: string, @Request() req) {
    return this.hangoutsService.leaveHangout(id, req.user.id);
  }

}