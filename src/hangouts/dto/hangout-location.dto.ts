import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  MaxLength,
  Min,
  Max,
  ValidateNested,
  ValidateIf,
  IsNotEmpty,
  IsDefined,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  HangoutLocationType,
  TravelMode,
} from '../schemas/hangout-location.schema';

export const MAX_ROUTE_POINTS = 5000;

// Every entry must be a [lat, lng] pair with valid coordinates
@ValidatorConstraint({ name: 'isLatLngPath', async: false })
class IsLatLngPathConstraint implements ValidatorConstraintInterface {
  validate(path: unknown) {
    return (
      Array.isArray(path) &&
      path.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          typeof p[0] === 'number' &&
          p[0] >= -90 &&
          p[0] <= 90 &&
          typeof p[1] === 'number' &&
          p[1] >= -180 &&
          p[1] <= 180,
      )
    );
  }

  defaultMessage() {
    return 'path must be an array of [lat, lng] pairs';
  }
}

export class GeoPointDto {
  @ApiProperty({ example: 27.6727 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 85.3253 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiPropertyOptional({ example: 'Patan Durbar Square' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    example: 'Patan Durbar Square, Lalitpur, Bagmati Province, Nepal',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}

export class HangoutLocationDto {
  @ApiProperty({
    enum: HangoutLocationType,
    example: HangoutLocationType.PLACE,
  })
  @IsEnum(HangoutLocationType)
  type: HangoutLocationType;

  @ApiProperty({ example: 'Patan Durbar Square' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name: string;

  @ApiPropertyOptional({
    type: GeoPointDto,
    description: 'Required when type is "place"',
  })
  @ValidateIf((o) => o.type === HangoutLocationType.PLACE)
  @IsDefined()
  @ValidateNested()
  @Type(() => GeoPointDto)
  point?: GeoPointDto;

  @ApiPropertyOptional({
    type: GeoPointDto,
    description: 'Required when type is "route"',
  })
  @ValidateIf((o) => o.type === HangoutLocationType.ROUTE)
  @IsDefined()
  @ValidateNested()
  @Type(() => GeoPointDto)
  from?: GeoPointDto;

  @ApiPropertyOptional({
    type: GeoPointDto,
    description: 'Required when type is "route"',
  })
  @ValidateIf((o) => o.type === HangoutLocationType.ROUTE)
  @IsDefined()
  @ValidateNested()
  @Type(() => GeoPointDto)
  to?: GeoPointDto;

  @ApiPropertyOptional({
    description: `Route line as [lat, lng] pairs (max ${MAX_ROUTE_POINTS})`,
    example: [
      [27.7154, 85.3123],
      [27.7172, 85.324],
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(MAX_ROUTE_POINTS)
  @Validate(IsLatLngPathConstraint)
  path?: number[][];

  @ApiPropertyOptional({ example: 12500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceMeters?: number;

  @ApiPropertyOptional({ example: 1800 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationSeconds?: number;

  @ApiPropertyOptional({ enum: TravelMode, example: TravelMode.DRIVING })
  @IsOptional()
  @IsEnum(TravelMode)
  travelMode?: TravelMode;
}
