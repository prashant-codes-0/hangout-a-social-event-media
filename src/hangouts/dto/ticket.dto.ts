import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TICKET_PAYMENT_METHODS, TicketPaymentStatus } from '../schemas/hangout-ticket.schema';
import type { TicketPaymentMethod } from '../schemas/hangout-ticket.schema';

export class TicketCheckInDto {
  @ApiProperty({ description: 'The code on the ticket (from its QR, or typed)', example: 'K7MP-Q2XA' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code: string;
}

// The payment changes an organizer can record by hand
const SETTABLE_PAYMENT_STATUSES = [
  TicketPaymentStatus.PAID,
  TicketPaymentStatus.UNPAID,
  TicketPaymentStatus.REFUNDED,
] as const;

export class UpdateTicketPaymentDto {
  @ApiProperty({
    description:
      'paid / unpaid for an active ticket; refunded once a cancelled, paid ticket has been paid back',
    enum: SETTABLE_PAYMENT_STATUSES,
  })
  @IsIn(SETTABLE_PAYMENT_STATUSES)
  status: (typeof SETTABLE_PAYMENT_STATUSES)[number];

  @ApiPropertyOptional({ description: 'How it was paid', enum: TICKET_PAYMENT_METHODS })
  @IsOptional()
  @IsIn(TICKET_PAYMENT_METHODS)
  method?: TicketPaymentMethod;

  @ApiPropertyOptional({
    description: 'Rupees received (defaults to the hangout price)',
    example: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  amount?: number;
}
