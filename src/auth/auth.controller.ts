import { Controller, Post, Body, UseGuards, Request, Get, Patch } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignUpDto, SignInDto } from './dto/auth.dto';
import { VerifyUserDto } from './dto/verify-user.dto';
import { VerifyOnlyDto } from './dto/verify-only.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { AdminGuard } from './guards/admin.guard';
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

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Patch('verify-only')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Verify user only (admin only) - does not change role' })
  @ApiResponse({ status: 200, description: 'User successfully verified' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBody({ type: VerifyOnlyDto })
  async verifyUserOnly(@Body() verifyOnlyDto: VerifyOnlyDto) {
    return this.authService.verifyUserOnly(verifyOnlyDto.userId);
  }
}