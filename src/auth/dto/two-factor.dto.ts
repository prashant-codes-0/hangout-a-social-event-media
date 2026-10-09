import { IsJWT, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TwoFactorCodeDto {
  @ApiProperty({
    description:
      'The 6-digit code from your authenticator app, or one of your recovery codes',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code: string;
}

export class VerifyTwoFactorLoginDto extends TwoFactorCodeDto {
  @ApiProperty({
    description: 'The twoFactorToken returned by sign-in when 2FA is on',
  })
  @IsJWT()
  twoFactorToken: string;
}
