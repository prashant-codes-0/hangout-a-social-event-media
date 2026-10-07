import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PushSubscriptionDto,
  PushUnsubscribeDto,
} from './dto/push-subscription.dto';
import { PushService } from './push.service';

@ApiTags('Notifications')
@Controller('notifications/push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('config')
  @ApiOperation({
    summary:
      'Whether Web Push is available, and the VAPID public key browsers subscribe with',
  })
  config() {
    return this.pushService.config();
  }

  @Post('subscriptions')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Save this browser's push subscription for the signed-in user",
  })
  @ApiBody({ type: PushSubscriptionDto })
  subscribe(
    @Body() dto: PushSubscriptionDto,
    @Request() req,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.pushService.subscribe(req.user.id, dto, userAgent);
  }

  @Delete('subscriptions')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Stop push notifications for this browser' })
  @ApiBody({ type: PushUnsubscribeDto })
  unsubscribe(@Body() dto: PushUnsubscribeDto, @Request() req) {
    return this.pushService.unsubscribe(req.user.id, dto.endpoint);
  }
}
