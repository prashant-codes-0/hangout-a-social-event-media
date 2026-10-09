import { Equals, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Re-authentication payload for requesting account deletion.
 *
 * - Accounts with 2FA on must send a current authenticator or recovery code.
 * - Password accounts must send their current password.
 * - Social-only accounts (no known password, no 2FA) confirm with the phrase.
 */
export class DeleteAccountDto {
  @ApiPropertyOptional({
    description: 'Your current password (required when 2FA is not enabled)',
    example: 'mySecret123',
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({
    description:
      'A current authenticator code or a recovery code (required when 2FA is enabled)',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  twoFactorCode?: string;

  @ApiProperty({
    description: 'Type DELETE to confirm this cannot be undone',
    example: 'DELETE',
  })
  @IsString()
  @IsNotEmpty()
  @Equals('DELETE', {
    message: 'Type DELETE to confirm account deletion',
  })
  confirmation: string;
}

export class CancelDeletionDto {
  @ApiProperty({
    description: 'Cancellation token from the deletion-scheduled email',
    example: '8f14e45fceea167a5a36dedd4bea2543...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
