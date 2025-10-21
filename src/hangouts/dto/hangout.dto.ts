import { IsString, IsDateString, IsBoolean, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHangoutDto {
  @ApiProperty({
    description: 'Hangout title',
    example: 'Networking Night at Downtown Hotel',
  })
  @IsString()
  title: string;

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

  @ApiProperty({
    description: 'Date and time of the hangout (ISO 8601 format)',
    example: '2024-12-25T19:00:00Z',
  })
  @IsDateString()
  time: string;

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
    description: 'Date and time of the hangout (ISO 8601 format)',
    example: '2024-12-26T20:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  time?: string;

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