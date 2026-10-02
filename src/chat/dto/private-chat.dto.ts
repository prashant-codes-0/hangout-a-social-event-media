import { IsString, IsNotEmpty, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestPrivateChatDto {
  @ApiProperty({ description: 'Hangout both users belong to', example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  hangoutId: string;

  @ApiProperty({ description: 'User to chat with privately', example: '507f1f77bcf86cd799439013' })
  @IsString()
  @IsNotEmpty()
  recipientId: string;
}

export class RespondPrivateChatDto {
  @ApiProperty({ description: 'Accept (true) or decline (false) the request', example: true })
  @IsBoolean()
  accept: boolean;
}

export class SendPrivateMessageDto {
  @ApiProperty({ description: 'Message content', example: 'Hey, want to grab coffee before the hangout?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
