import { IsString, IsNotEmpty, IsOptional, IsEnum, IsMongoId, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    description: 'Hangout ID where the message is sent',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsNotEmpty()
  hangoutId: string;

  @ApiProperty({
    description: 'Message content',
    example: 'Hey everyone! Looking forward to this hangout!',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    description: 'Type of message',
    enum: ['text', 'image', 'system'],
    example: 'text',
    required: false,
  })
  @IsOptional()
  @IsEnum(['text', 'image', 'system'])
  messageType?: string;

  @ApiProperty({
    description: 'Id of the message this one replies to (same hangout)',
    example: '507f1f77bcf86cd799439099',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  replyToId?: string;
}

export class ReactDto {
  @ApiProperty({ description: 'Emoji to toggle on the message', example: '👍' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  emoji: string;
}

export class MarkReadDto {
  @ApiProperty({ description: 'Everything in the hangout up to and including this message is marked read', example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  upToMessageId: string;
}

export class EditMessageDto {
  @ApiProperty({
    description: 'New message content',
    example: 'Updated message content',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class MessageResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  _id: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439012' })
  hangoutId: string;

  @ApiProperty({
    example: {
      _id: '507f1f77bcf86cd799439013',
      name: 'John Doe',
      email: 'john@example.com'
    }
  })
  userId: object;

  @ApiProperty({ example: 'Hey everyone! Looking forward to this hangout!' })
  content: string;

  @ApiProperty({ example: 'text' })
  messageType: string;

  @ApiProperty({ example: false })
  isEdited: boolean;

  @ApiProperty({ example: '2024-12-20T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2024-12-20T10:00:00.000Z' })
  updatedAt: string;
}