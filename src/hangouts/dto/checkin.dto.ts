import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckInCodeDto {
  @ApiProperty({
    description: 'Issue a fresh code even if the current one is still valid',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  rotate?: boolean;
}

export class CheckInDto {
  @ApiProperty({
    description: 'Code shown by the organizer (from the QR / signboard)',
    example: 'K7MPQ2',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;

  @ApiProperty({
    description: 'Your latitude, for a proximity check-in',
    example: 27.7172,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiProperty({
    description: 'Your longitude, for a proximity check-in',
    example: 85.324,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}

export class LiveLocationDto {
  @ApiProperty({ description: 'Your current latitude', example: 27.7172 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ description: 'Your current longitude', example: 85.324 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}
