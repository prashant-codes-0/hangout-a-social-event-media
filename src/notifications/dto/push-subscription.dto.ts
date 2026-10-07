import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// Browsers only hand out https push endpoints
const ENDPOINT_RULES = {
  protocols: ['https'],
  require_protocol: true,
  require_tld: false,
};

export class PushKeysDto {
  @ApiProperty({ description: 'Browser public key (base64url)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  p256dh: string;

  @ApiProperty({ description: 'Auth secret (base64url)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  auth: string;
}

// The JSON of a browser PushSubscription (subscription.toJSON())
export class PushSubscriptionDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/abc123' })
  @IsUrl(ENDPOINT_RULES)
  @MaxLength(1000)
  endpoint: string;

  @ApiProperty({ type: PushKeysDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

export class PushUnsubscribeDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/abc123' })
  @IsUrl(ENDPOINT_RULES)
  @MaxLength(1000)
  endpoint: string;
}
