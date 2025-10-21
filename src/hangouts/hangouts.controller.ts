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
import { HangoutsService } from './hangouts.service';
import { CreateHangoutDto, UpdateHangoutDto } from './dto/hangout.dto';
import { JoinRequestStatus } from './schemas/join-request.schema';

@Controller('hangouts')
export class HangoutsController {
  constructor(private readonly hangoutsService: HangoutsService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Body() createHangoutDto: CreateHangoutDto, @Request() req) {
    return this.hangoutsService.create(createHangoutDto, req.user.id);
  }

  @Get()
  findAll(@Query() filters: { purpose?: string; place?: string; date?: string }) {
    return this.hangoutsService.findAll(filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.hangoutsService.findOne(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateHangoutDto: UpdateHangoutDto,
    @Request() req,
  ) {
    return this.hangoutsService.update(id, updateHangoutDto, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.hangoutsService.remove(id, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/join')
  requestToJoin(@Param('id') id: string, @Request() req) {
    return this.hangoutsService.requestToJoin(id, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('requests/:requestId')
  handleJoinRequest(
    @Param('requestId') requestId: string,
    @Body('status') status: JoinRequestStatus,
    @Request() req,
  ) {
    return this.hangoutsService.handleJoinRequest(requestId, status, req.user.id);
  }

  @Post(':id/blast')
  addBlast(@Param('id') id: string) {
    return this.hangoutsService.addBlast(id);
  }
}