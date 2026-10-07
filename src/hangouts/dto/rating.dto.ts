import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsMongoId,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class RateItemDto {
  @IsMongoId()
  userId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  score: number;
}

export class RateHangoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RateItemDto)
  items: RateItemDto[];
}
