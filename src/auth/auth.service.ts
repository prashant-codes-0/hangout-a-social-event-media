import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from './schemas/user.schema';
import { SignUpDto, SignInDto } from './dto/auth.dto';
import { EmailService } from '../common/services/email.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  async signUp(signUpDto: SignUpDto) {
    const { name, email, password } = signUpDto;

    // Check if user already exists
    const existingUser = await this.userModel.findOne({ email });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = new this.userModel({
      name,
      email,
      passwordHash,
    });

    await user.save();

    // Generate JWT token
    const payload = { sub: user._id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        verified: user.verified,
      },
    };
  }

  async signIn(signInDto: SignInDto) {
    const { email, password } = signInDto;

    // Find user
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT token
    const payload = { sub: user._id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        verified: user.verified,
      },
    };
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.userModel.findOne({ email });
    if (user && await bcrypt.compare(password, user.passwordHash)) {
      const { passwordHash, ...result } = user.toObject();
      return result;
    }
    return null;
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id);
  }



  /**
   * Change the user's role and mark them verified.
   * This is the behavior previously exposed as `verifyUser`.
   */
  async changeRoleAndVerify(userId: string, role: UserRole): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.verified = true;
    user.role = role;
    await user.save();

    return user;
  }

  /**
   * Verify the user only (set verified = true) without changing role.
   */
  async verifyUserOnly(userId: string, otpCode: string): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if OTP is valid
    if (!user.otpCode || user.otpCode !== otpCode) {
      throw new BadRequestException('Invalid OTP code');
    }

    // Check if OTP is expired
    if (!user.otpExpiry || user.otpExpiry < new Date()) {
      throw new BadRequestException('OTP code has expired');
    }

    user.verified = true;
    user.otpCode = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Send welcome email
    await this.emailService.sendWelcomeEmail(user.email, user.name);

    return user;
  }

  async sendOTP(email: string) {
    const user = await this.userModel.findOne({ email });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.verified) {
      throw new BadRequestException('User is already verified');
    }

    // Generate OTP
    const otpCode = this.emailService.generateOTP();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10); // OTP expires in 10 minutes

    // Save OTP to user
    user.otpCode = otpCode;
    user.otpExpiry = otpExpiry;
    await user.save();

    // Send OTP email
    await this.emailService.sendOTPEmail(user.email, user.name, otpCode);

    return {
      success: true,
      message: 'OTP sent successfully to your email',
      data: {
        email: user.email,
        expiresIn: '10 minutes',
      },
    };
  }

  async verifyOTP(email: string, otpCode: string) {
    const user = await this.userModel.findOne({ email });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if OTP is valid
    if (!user.otpCode || user.otpCode !== otpCode) {
      throw new BadRequestException('Invalid OTP code');
    }

    // Check if OTP is expired
    if (!user.otpExpiry || user.otpExpiry < new Date()) {
      throw new BadRequestException('OTP code has expired');
    }

    user.verified = true;
    user.otpCode = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Send welcome email
    await this.emailService.sendWelcomeEmail(user.email, user.name);

    return {
      success: true,
      message: 'Email verified successfully',
      data: {
        userId: user._id,
        name: user.name,
        email: user.email,
        verified: user.verified,
      },
    };
  }

  async resendOTP(email: string) {
    return this.sendOTP(email);
  }

  async getAllUsers(): Promise<User[]> {
    return this.userModel.find({}, '-passwordHash').exec();
  }
}