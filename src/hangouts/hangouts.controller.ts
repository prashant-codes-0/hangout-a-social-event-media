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

@ApiTags('Hangouts')
@Controller('hangouts')
export class HangoutsController {
  constructor(private readonly hangoutsService: HangoutsService) {}

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
  @ApiOperation({ summary: 'Get all public hangouts with optional filters' })
  @ApiQuery({ name: 'purpose', required: false, description: 'Filter by purpose' })
  @ApiQuery({ name: 'place', required: false, description: 'Filter by place' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by date (YYYY-MM-DD)' })
  @ApiResponse({ status: 200, description: 'List of hangouts', type: [HangoutResponseDto] })
  findAll(@Query() filters: { purpose?: string; place?: string; date?: string }) {
    return this.hangoutsService.findAll(filters);
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

  @Get('by-user/:userId')
  @ApiOperation({ summary: 'Get hangouts created by a specific user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of hangouts created by the specified user',
    type: [HangoutResponseDto]
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  getHangoutsByUser(@Param('userId') userId: string) {
    return this.hangoutsService.getHangoutsByUser(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get hangout details by ID' })
  @ApiParam({ name: 'id', description: 'Hangout ID' })
  @ApiResponse({ status: 200, description: 'Hangout details' })
  @ApiResponse({ status: 404, description: 'Hangout not found' })
  findOne(@Param('id') id: string) {
    return this.hangoutsService.findOne(id);
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

  @Post(':id/blast')
  @ApiOperation({ summary: 'Add a blast (like) to a hangout' })
  @ApiParam({ name: 'id', description: 'Hangout ID' })
  @ApiResponse({ status: 200, description: 'Blast successfully added' })
  @ApiResponse({ status: 404, description: 'Hangout not found' })
  addBlast(@Param('id') id: string) {
    return this.hangoutsService.addBlast(id);
  }

}