import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../schemas/user.schema';

export class VerifyUserDto {
  @ApiProperty({
    description: 'User ID to verify',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  userId: string;

  @ApiProperty({
    description: 'New role for the user',
    enum: UserRole,
    example: UserRole.ADMIN,
  })
  @IsEnum(UserRole)
  role: UserRole;
}