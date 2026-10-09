import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { TicketCheckInDto, UpdateTicketPaymentDto } from './dto/ticket.dto';
import { UserRole } from '../auth/schemas/user.schema';

@ApiTags('Tickets')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('hangouts')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get('tickets/mine')
  @ApiOperation({ summary: 'All my active tickets, soonest hangout first' })
  myTickets(@Request() req) {
    return this.tickets.myTickets(req.user.id);
  }

  @Get(':id/tickets/mine')
  @ApiOperation({
    summary:
      'My ticket for this hangout (code for the QR, payment status, check-in)',
  })
  @ApiParam({ name: 'id', description: 'Hangout ID' })
  @ApiResponse({
    status: 404,
    description: "You don't have a ticket for this hangout",
  })
  myTicket(@Param('id') id: string, @Request() req) {
    return this.tickets.myTicket(id, req.user.id);
  }

  @Get(':id/tickets')
  @ApiOperation({
    summary:
      'Organizer dashboard: every ticket plus totals (organizer or admin)',
  })
  @ApiParam({ name: 'id', description: 'Hangout ID' })
  @ApiResponse({ status: 200, description: '{ hangout, summary, tickets }' })
  @ApiResponse({
    status: 403,
    description: 'Only the hangout organizer can manage tickets',
  })
  organizerView(@Param('id') id: string, @Request() req) {
    return this.tickets.organizerView(
      id,
      req.user.id,
      req.user.role === UserRole.ADMIN,
    );
  }

  @Post(':id/tickets/check-in')
  @ApiOperation({
    summary:
      'Check someone in by scanning or typing their ticket code (organizer or admin)',
  })
  @ApiParam({ name: 'id', description: 'Hangout ID' })
  @ApiBody({ type: TicketCheckInDto })
  @ApiResponse({
    status: 201,
    description: '{ alreadyCheckedIn, checkedInAt, ticket, price }',
  })
  @ApiResponse({
    status: 400,
    description: 'Unknown or cancelled ticket, or outside the check-in window',
  })
  checkIn(
    @Param('id') id: string,
    @Body() dto: TicketCheckInDto,
    @Request() req,
  ) {
    return this.tickets.checkInByCode(
      id,
      dto.code,
      req.user.id,
      req.user.role === UserRole.ADMIN,
    );
  }

  @Patch(':id/tickets/:ticketId/payment')
  @ApiOperation({
    summary:
      'Record a payment or refund made outside the app (organizer or admin)',
  })
  @ApiParam({ name: 'id', description: 'Hangout ID' })
  @ApiParam({ name: 'ticketId', description: 'Ticket ID' })
  @ApiBody({ type: UpdateTicketPaymentDto })
  @ApiResponse({
    status: 400,
    description: 'That change does not fit the ticket (e.g. already paid)',
  })
  updatePayment(
    @Param('id') id: string,
    @Param('ticketId') ticketId: string,
    @Body() dto: UpdateTicketPaymentDto,
    @Request() req,
  ) {
    return this.tickets.updatePayment(
      id,
      ticketId,
      dto,
      req.user.id,
      req.user.role === UserRole.ADMIN,
    );
  }
}
