import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOnlyDto {
  @ApiProperty({
    description: 'User ID to verify',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  userId: string;
}
