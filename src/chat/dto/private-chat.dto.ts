import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AttachmentDto } from './chat.dto';

export class RequestPrivateChatDto {
  @ApiProperty({
    description: 'Hangout both users belong to',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsNotEmpty()
  hangoutId: string;

  @ApiProperty({
    description: 'User to chat with privately',
    example: '507f1f77bcf86cd799439013',
  })
  @IsString()
  @IsNotEmpty()
  recipientId: string;
}

export class RespondPrivateChatDto {
  @ApiProperty({
    description: 'Accept (true) or decline (false) the request',
    example: true,
  })
  @IsBoolean()
  accept: boolean;
}

export class SendPrivateMessageDto {
  @ApiProperty({
    description:
      'Message content (text along with, or instead of, an attachment)',
    example: 'Hey, want to grab coffee before the hangout?',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiProperty({
    description:
      'File/image/voice note previously uploaded via POST /upload (max 2 MB)',
    type: AttachmentDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AttachmentDto)
  attachment?: AttachmentDto;
}
