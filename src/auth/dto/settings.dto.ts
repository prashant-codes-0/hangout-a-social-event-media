import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    description: 'Play sounds for messages, chat requests and other alerts',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  notificationSounds?: boolean;

  @ApiPropertyOptional({
    description: 'Play the ringtone for incoming audio/video calls',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  callRingtone?: boolean;
}

export interface SettingsResponse {
  notificationSounds: boolean;
  callRingtone: boolean;
}
