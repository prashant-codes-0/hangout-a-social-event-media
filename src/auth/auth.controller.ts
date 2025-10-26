import { Controller, Post, Body, UseGuards, Request, Get, Patch } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignUpDto, SignInDto } from './dto/auth.dto';
import { VerifyUserDto } from './dto/verify-user.dto';
import { VerifyOnlyDto } from './dto/verify-only.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { SendOTPDto, VerifyOTPDto, ResendOTPDto } from './dto/otp.dto';
import { AdminGuard } from '../common/guards/admin.guard';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Post('signup')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: ApiResponseDto
  })
  @ApiResponse({
    status: 409,
    description: 'User with this email already exists',
    type: ApiResponseDto
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
    type: ApiResponseDto
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    type: ApiResponseDto
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
    type: ApiResponseDto
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ApiResponseDto
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
    type: ApiResponseDto
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
    return this.authService.changeRoleAndVerify(verifyUserDto.userId, verifyUserDto.role);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('verify-only')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Verify user only with OTP (admin only) - does not change role' })
  @ApiResponse({ status: 200, description: 'User successfully verified' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP code' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBody({ type: VerifyOnlyDto })
  async verifyUserOnly(@Body() verifyOnlyDto: VerifyOnlyDto) {
    return this.authService.verifyUserOnly(verifyOnlyDto.userId, verifyOnlyDto.otpCode);
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
          expiresIn: '10 minutes'
        }
      }
    }
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
          verified: true
        }
      }
    }
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
          expiresIn: '10 minutes'
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'User is already verified' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBody({ type: ResendOTPDto })
  async resendOTP(@Body() resendOTPDto: ResendOTPDto) {
    return this.authService.resendOTP(resendOTPDto.email);
  }
}