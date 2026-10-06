import { IsString, IsDateString, IsBoolean, IsOptional, IsNumber, Min, Max, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HangoutLocationDto } from './hangout-location.dto';
import { HangoutStatus } from '../schemas/hangout.schema';

export class CreateHangoutDto {
  @ApiProperty({
    description: 'Hangout title',
    example: 'Networking Night at Downtown Hotel',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Detailed description of the hangout',
    example: 'Join us for an amazing networking event where professionals from various industries come together to share ideas, make connections, and have a great time!',
  })
  @IsString()
  description: string;

  @ApiProperty({
    description: 'Purpose or category of the hangout',
    example: 'Professional networking',
  })
  @IsString()
  purpose: string;

  @ApiProperty({
    description: 'Location or venue of the hangout',
    example: 'Downtown Hotel, Main Street',
  })
  @IsString()
  place: string;

  @ApiPropertyOptional({
    description: 'Map location picked from OpenStreetMap: a place/landmark or a from → to route',
    type: HangoutLocationDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => HangoutLocationDto)
  location?: HangoutLocationDto;

  @ApiProperty({
    description: 'Date and time of the hangout (ISO 8601 format)',
    example: '2024-12-25T19:00:00Z',
  })
  @IsDateString()
  time: string;

  @ApiPropertyOptional({
    description: 'How long the hangout runs, in minutes. Used to decide when it finishes.',
    example: 120,
    minimum: 15,
    maximum: 1440,
    default: 120,
  })
  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(1440)
  durationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Whether this is a sponsored hangout',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  sponsored?: boolean;

  @ApiPropertyOptional({
    description: 'ID of the sponsor (if sponsored)',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsString()
  sponsorId?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of attendees',
    example: 20,
    minimum: 1,
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({
    description: 'Whether the hangout is public or private',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateHangoutDto {
  @ApiPropertyOptional({
    description: 'Hangout title',
    example: 'Updated Networking Night',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the hangout',
    example: 'Updated description with more details about the networking event.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Purpose or category of the hangout',
    example: 'Casual networking',
  })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({
    description: 'Location or venue of the hangout',
    example: 'New Venue, Side Street',
  })
  @IsOptional()
  @IsString()
  place?: string;

  @ApiPropertyOptional({
    description: 'Map location (send null to remove it)',
    type: HangoutLocationDto,
    nullable: true,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => HangoutLocationDto)
  location?: HangoutLocationDto | null;

  @ApiPropertyOptional({
    description: 'Date and time of the hangout (ISO 8601 format)',
    example: '2024-12-26T20:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  time?: string;

  @ApiPropertyOptional({
    description: 'How long the hangout runs, in minutes. Used to decide when it finishes.',
    example: 180,
    minimum: 15,
    maximum: 1440,
  })
  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(1440)
  durationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of attendees',
    example: 25,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({
    description: 'Whether the hangout is public or private',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

// Manual lifecycle control by the organizer or an admin. Everything except
// `cancelled` is re-derived from the start time by the scheduler.
export class UpdateHangoutStatusDto {
  @ApiProperty({
    description: 'New status. Only `cancelled` (and restoring to `upcoming`) can be set by hand.',
    enum: Object.values(HangoutStatus),
    example: HangoutStatus.CANCELLED,
  })
  @IsIn(Object.values(HangoutStatus))
  status: HangoutStatus;

  @ApiPropertyOptional({
    description: 'Why the hangout was cancelled — shown to every attendee',
    example: 'Venue is unavailable, rescheduling soon',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}