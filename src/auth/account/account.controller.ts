import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AccountService } from './account.service';
import { CancelDeletionDto, DeleteAccountDto } from '../dto/delete-account.dto';

@ApiTags('Account')
@Controller('auth/account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Post('deletion-request')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Schedule your account for deletion in 7 days (re-authentication required)',
  })
  @ApiResponse({ status: 201, description: '{ scheduledFor, cancelDeadline }' })
  @ApiResponse({ status: 400, description: 'Missing re-auth factor' })
  @ApiResponse({ status: 401, description: 'Wrong password or 2FA code' })
  @ApiBody({ type: DeleteAccountDto })
  requestDeletion(
    @Request() req: { user: { id: string } },
    @Body() dto: DeleteAccountDto,
  ) {
    return this.account.requestDeletion(req.user.id, dto);
  }

  @Post('cancel-deletion')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancel a pending deletion using the emailed token',
  })
  @ApiResponse({ status: 200, description: 'Account restored' })
  @ApiResponse({ status: 400, description: 'Token invalid or expired' })
  @ApiBody({ type: CancelDeletionDto })
  cancelDeletion(@Body() dto: CancelDeletionDto) {
    return this.account.cancelDeletion(dto.token);
  }

  @Get('export')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Download a JSON export of all your account data' })
  @ApiResponse({ status: 200, description: 'A JSON file attachment' })
  async exportData(
    @Request() req: { user: { id: string } },
    @Res() res: Response,
  ) {
    const data = await this.account.exportUserData(req.user.id);
    const filename = `hangout-data-${req.user.id}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  }
}
