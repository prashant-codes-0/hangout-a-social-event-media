import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User, UserSchema } from './schemas/user.schema';
import { JwtStrategy } from './jwt.strategy';
import { LocalStrategy } from './local.strategy';
import { GoogleStrategy } from './google.strategy';
import { FacebookStrategy } from './facebook.strategy';
import {
  GoogleEnabledGuard,
  FacebookEnabledGuard,
} from './social-config.guards';
import { EmailService } from '../common/services/email.service';
import { TwoFactorService } from './two-factor/two-factor.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'your-secret-key'),
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    TwoFactorService,
    JwtStrategy,
    LocalStrategy,
    EmailService,
    GoogleStrategy,
    FacebookStrategy,
    GoogleEnabledGuard,
    FacebookEnabledGuard,
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
