import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Patch,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignUpDto, SignInDto } from './dto/auth.dto';
import { VerifyUserDto } from './dto/verify-user.dto';
import { VerifyOnlyDto } from './dto/verify-only.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { SendOTPDto, VerifyOTPDto, ResendOTPDto } from './dto/otp.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto';
import { UpdateSettingsDto } from './dto/settings.dto';
import { AdminGuard } from '../common/guards/admin.guard';
import {
  GoogleEnabledGuard,
  FacebookEnabledGuard,
  GoogleCallbackGuard,
  FacebookCallbackGuard,
  SocialCallbackRequest,
} from './social-config.guards';
import { ApiResponseDto } from '../common/dto/api-response.dto';

/** Minimal view of the express request Nest gives OAuth callback handlers. */
type OAuthRequest = SocialCallbackRequest;

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Get('me/settings')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Your app settings (notification sounds, call ringtone)',
  })
  @ApiResponse({
    status: 200,
    description: '{ notificationSounds, callRingtone }',
  })
  getSettings(@Request() req) {
    return this.authService.getSettings(req.user.id);
  }

  @Patch('me/settings')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update your app settings (send only the fields to change)',
  })
  @ApiBody({ type: UpdateSettingsDto })
  @ApiResponse({ status: 200, description: 'The full, updated settings' })
  @ApiResponse({ status: 400, description: 'Invalid or unknown setting' })
  updateSettings(@Request() req, @Body() dto: UpdateSettingsDto) {
    return this.authService.updateSettings(req.user.id, dto);
  }

  @Post('signup')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: ApiResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'User with this email already exists',
    type: ApiResponseDto,
  })
  @ApiBody({ type: SignUpDto })
  async signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  @UseGuards(AuthGuard('local'))
  @Post('signin')
  @ApiOperation({ summary: 'Sign in user' })
  @ApiResponse({
    status: 200,
    description: 'User successfully signed in',
    type: ApiResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    type: ApiResponseDto,
  })
  @ApiBody({ type: SignInDto })
  async signIn(@Request() req, @Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto);
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Get('users')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all users (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of all users',
    type: ApiResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ApiResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
    type: ApiResponseDto,
  })
  async getAllUsers() {
    return this.authService.getAllUsers();
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Patch('verify')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Verify user and set role (admin only)' })
  @ApiResponse({ status: 200, description: 'User successfully verified' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBody({ type: VerifyUserDto })
  async verifyUser(@Body() verifyUserDto: VerifyUserDto) {
    // preserve previous behavior: change role and verify
    return this.authService.changeRoleAndVerify(
      verifyUserDto.userId,
      verifyUserDto.role,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('verify-only')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Verify user only with OTP (admin only) - does not change role',
  })
  @ApiResponse({ status: 200, description: 'User successfully verified' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP code' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBody({ type: VerifyOnlyDto })
  async verifyUserOnly(@Body() verifyOnlyDto: VerifyOnlyDto) {
    return this.authService.verifyUserOnly(
      verifyOnlyDto.userId,
      verifyOnlyDto.otpCode,
    );
  }

  @Post('send-otp')
  @ApiOperation({ summary: 'Send OTP to user email for verification' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP sent successfully to your email',
        data: {
          email: 'user@example.com',
          expiresIn: '10 minutes',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'User is already verified' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBody({ type: SendOTPDto })
  async sendOTP(@Body() sendOTPDto: SendOTPDto) {
    return this.authService.sendOTP(sendOTPDto.email);
  }

  @Post('verify-otp')
  @ApiOperation({ summary: 'Verify user email with OTP code' })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
    schema: {
      example: {
        success: true,
        message: 'Email verified successfully',
        data: {
          userId: '507f1f77bcf86cd799439011',
          name: 'John Doe',
          email: 'user@example.com',
          verified: true,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP code' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBody({ type: VerifyOTPDto })
  async verifyOTP(@Body() verifyOTPDto: VerifyOTPDto) {
    return this.authService.verifyOTP(verifyOTPDto.email, verifyOTPDto.otpCode);
  }

  @Post('resend-otp')
  @ApiOperation({ summary: 'Resend OTP to user email' })
  @ApiResponse({
    status: 200,
    description: 'OTP resent successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP sent successfully to your email',
        data: {
          email: 'user@example.com',
          expiresIn: '10 minutes',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'User is already verified' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBody({ type: ResendOTPDto })
  async resendOTP(@Body() resendOTPDto: ResendOTPDto) {
    return this.authService.resendOTP(resendOTPDto.email);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Email a one-time password reset link' })
  @ApiResponse({
    status: 201,
    description:
      'Reset link sent (same reply whether or not the account exists)',
  })
  @ApiResponse({ status: 400, description: 'Invalid email format' })
  @ApiResponse({ status: 503, description: 'The email could not be sent' })
  @ApiBody({ type: ForgotPasswordDto })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Post('reset-password')
  @ApiOperation({
    summary: 'Set a new password using the token from the reset email',
  })
  @ApiResponse({ status: 201, description: 'Password updated' })
  @ApiResponse({ status: 400, description: 'Token invalid or expired' })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );
  }

  // ---- Social sign-in (Google / Facebook) ----

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Your own profile (used after a social callback to load a session)',
  })
  @ApiResponse({
    status: 200,
    description: '{ id, name, email, role, verified }',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@Request() req: { user?: { id?: string } }) {
    return this.authService.getMe(req.user?.id ?? '');
  }

  @Get('google')
  @UseGuards(GoogleEnabledGuard, AuthGuard('google'))
  @ApiOperation({ summary: 'Start Google sign-in (redirects to Google)' })
  @ApiResponse({ status: 302, description: 'Redirect to accounts.google.com' })
  googleAuth() {
    // The redirect is produced by the passport strategy; this handler never runs.
  }

  @Get('social/providers')
  @ApiOperation({
    summary: 'Which social sign-in providers are configured (the app hides the others)',
  })
  @ApiResponse({ status: 200, description: '{ google: boolean, facebook: boolean }' })
  socialProviders() {
    const has = (...keys: string[]) => keys.every((k) => !!this.configService.get<string>(k));
    return {
      google: has('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'),
      facebook: has('FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'),
    };
  }

  @Get('google/callback')
  @UseGuards(GoogleEnabledGuard, GoogleCallbackGuard)
  @ApiOperation({
    summary: 'Google OAuth callback (redirects to the frontend with a token)',
  })
  googleAuthCallback(@Request() req: OAuthRequest, @Res() res: Response): void {
    this.redirectWithToken(res, req, 'google');
  }

  @Get('facebook')
  @UseGuards(FacebookEnabledGuard, AuthGuard('facebook'))
  @ApiOperation({ summary: 'Start Facebook sign-in (redirects to Facebook)' })
  @ApiResponse({ status: 302, description: 'Redirect to facebook.com' })
  facebookAuth() {
    // The redirect is produced by the passport strategy; this handler never runs.
  }

  @Get('facebook/callback')
  @UseGuards(FacebookEnabledGuard, FacebookCallbackGuard)
  @ApiOperation({
    summary: 'Facebook OAuth callback (redirects to the frontend with a token)',
  })
  facebookAuthCallback(
    @Request() req: OAuthRequest,
    @Res() res: Response,
  ): void {
    this.redirectWithToken(res, req, 'facebook');
  }

  /**
   * Hands the freshly-issued JWT (or the reason sign-in failed) to the SPA via
   * its /auth/social-callback route. Using an explicit @Res() here bypasses
   * the global interceptor so the browser receives a plain redirect.
   *
   * The token travels in the URL fragment (#...), not the query string: the
   * fragment is never sent to any server, so the token can't end up in server
   * logs or Referer headers. The page removes it from the address bar at once.
   */
  private redirectWithToken(
    res: Response,
    req: OAuthRequest,
    provider: string,
  ): void {
    const frontendUrl = this.configService
      .get<string>('FRONTEND_URL', 'http://localhost:4200')
      .replace(/\/+$/, '');
    const token = req.user?.access_token;
    const params = new URLSearchParams({ provider });
    if (token) {
      params.set('token', token);
    } else {
      params.set('error', req.socialError || 'Sign-in failed. Please try again.');
    }
    res.redirect(`${frontendUrl}/auth/social-callback#${params.toString()}`);
  }
}
