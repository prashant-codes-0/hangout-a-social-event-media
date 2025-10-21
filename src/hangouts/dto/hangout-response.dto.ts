import { ApiProperty } from '@nestjs/swagger';

export class HangoutResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  _id: string;

  @ApiProperty({ example: 'Networking Night at Downtown Hotel' })
  title: string;

  @ApiProperty({ example: 'Professional networking' })
  purpose: string;

  @ApiProperty({ example: 'Downtown Hotel, Main Street' })
  place: string;

  @ApiProperty({ example: '2024-12-25T19:00:00.000Z' })
  time: string;

  @ApiProperty({ example: false })
  sponsored: boolean;

  @ApiProperty({ example: '507f1f77bcf86cd799439012', required: false })
  sponsorId?: string;

  @ApiProperty({ example: ['507f1f77bcf86cd799439013'], type: [String] })
  attendees: string[];

  @ApiProperty({ example: 5 })
  blasts: number;

  @ApiProperty({ example: 20 })
  capacity: number;

  @ApiProperty({ example: true })
  isPublic: boolean;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  createdBy: string;

  @ApiProperty({ example: '2024-12-20T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2024-12-20T10:00:00.000Z' })
  updatedAt: string;
}

export class JoinRequestResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439014' })
  _id: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  hangoutId: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439012' })
  userId: string;

  @ApiProperty({ example: 'pending', enum: ['pending', 'approved', 'rejected'] })
  status: string;

  @ApiProperty({ example: '2024-12-20T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2024-12-20T10:00:00.000Z' })
  updatedAt: string;
}