import { IsString, IsDateString, IsBoolean, IsOptional, IsNumber, Min } from 'class-validator';

export class CreateHangoutDto {
  @IsString()
  title: string;

  @IsString()
  purpose: string;

  @IsString()
  place: string;

  @IsDateString()
  time: string;

  @IsOptional()
  @IsBoolean()
  sponsored?: boolean;

  @IsOptional()
  @IsString()
  sponsorId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateHangoutDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  place?: string;

  @IsOptional()
  @IsDateString()
  time?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}