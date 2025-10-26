import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOnlyDto {
  @ApiProperty({
    description: 'User ID to verify',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'OTP code sent to user email',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  otpCode: string;
}
