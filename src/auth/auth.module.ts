import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { User } from '../users/entites/user.entity';
import { OtpService } from '../otp/otp.service';
import { MailModule } from '../mail/mail.module';   // ← ADD THIS

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({}),
    MailModule,                                      // ← ADD THIS
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy, OtpService],
  exports: [AuthService],
})
export class AuthModule {}