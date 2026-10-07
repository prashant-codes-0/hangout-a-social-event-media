import { IsString, IsNotEmpty, IsOptional, IsEnum, IsMongoId, MaxLength, IsArray, ArrayMaxSize, ArrayMinSize, MinLength, ValidateNested, IsInt, Min, Max, IsUrl, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

const MAX_MENTIONS = 20;
const MAX_POLL_OPTIONS = 6;
import { ApiProperty } from '@nestjs/swagger';
import { MAX_ATTACHMENT_BYTES } from '../media.util';

// Result of POST /upload; sending it with a message stores the file on the message itself
export class AttachmentDto {
  @ApiProperty({
    description: 'Public URL of the stored file (Cloudinary)',
    example: 'https://res.cloudinary.com/demo/image/upload/v1/hangout/chat/abc/photo.png',
  })
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(500)
  url: string;

  @ApiProperty({
    description: 'Cloudinary public id, so the file can be deleted with its message',
    example: 'hangout/chat/507f1f77bcf86cd799439011/xyz',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  publicId: string;

  @ApiProperty({ description: 'Original file name', example: 'beach-photo.png' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ description: 'MIME type of the file', example: 'image/png' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  mimeType: string;

  @ApiProperty({ description: 'File size in bytes (max 2 MB)', example: 102400 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ATTACHMENT_BYTES)
  size: number;

  @ApiProperty({ description: 'Voice note length in milliseconds', example: 4200, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60 * 60 * 1000)
  durationMs?: number;

  @ApiProperty({
    description: 'How the client renders it: image, voice note, or other file',
    enum: ['image', 'file', 'voice'],
    example: 'image',
    required: false,
  })
  @IsOptional()
  @IsIn(['image', 'file', 'voice'])
  kind?: 'image' | 'file' | 'voice';
}

export class SendMessageDto {
  @ApiProperty({
    description: 'Hangout ID where the message is sent',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsNotEmpty()
  hangoutId: string;

  @ApiProperty({
    description: 'Message content (text along with, or instead of, an attachment)',
    example: 'Hey everyone! Looking forward to this hangout!',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @ApiProperty({
    description: 'Type of message (the attachment kind overrides it when one is sent)',
    enum: ['text', 'image', 'system', 'poll', 'file', 'voice'],
    example: 'text',
    required: false,
  })
  @IsOptional()
  @IsEnum(['text', 'image', 'system', 'poll', 'file', 'voice'])
  messageType?: string;

  @ApiProperty({
    description: 'File/image/voice note previously uploaded via POST /upload (max 2 MB)',
    type: AttachmentDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AttachmentDto)
  attachment?: AttachmentDto;

  @ApiProperty({
    description: 'Id of the message this one replies to (same hangout)',
    example: '507f1f77bcf86cd799439099',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  replyToId?: string;

  @ApiProperty({
    description: 'Ids of members tagged with @Name in the text (each gets an alert)',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MENTIONS)
  @IsMongoId({ each: true })
  mentions?: string[];
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

  @ApiProperty({
    description: 'Ids of members tagged in the new text; newly tagged members get an alert',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MENTIONS)
  @IsMongoId({ each: true })
  mentions?: string[];
}

export class PollOptionDto {
  @ApiProperty({ description: 'Choice shown to voters', example: 'Saturday 6 PM' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  text: string;

  @ApiProperty({
    description:
      'Machine value for the choice: an ISO date/time when the poll kind is "time", or the place text when it is "place"',
    example: '2026-10-10T18:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  value?: string;
}

export class CreatePollDto {
  @ApiProperty({ description: 'Poll question shown in chat', example: 'Which time works for everyone?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  question: string;

  @ApiProperty({ description: 'Choices (2-6)', type: [PollOptionDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(MAX_POLL_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => PollOptionDto)
  options: PollOptionDto[];

  @ApiProperty({
    description: 'What the winning option may change on the hangout',
    enum: ['general', 'time', 'place'],
    default: 'general',
  })
  @IsOptional()
  @IsEnum(['general', 'time', 'place'])
  kind?: 'general' | 'time' | 'place';

  @ApiProperty({
    description: 'Optional voting deadline in hours from now',
    example: 24,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  expiresInHours?: number;
}

export class VotePollDto {
  @ApiProperty({ description: 'The option being voted for', example: '507f1f77bcf86cd799439055' })
  @IsMongoId()
  optionId: string;
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