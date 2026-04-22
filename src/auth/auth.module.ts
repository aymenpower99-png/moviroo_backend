import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthProfileService } from './auth-profile.service';
import { AuthEmailChangeService } from './auth-email-change.service';
import { AuthPasswordService } from './auth-password.service';
import { AuthPasskeyService } from './auth-passkey.service';
import { AuthAccountService } from './auth-account.service';

import { User } from '../users/entites/user.entity';
import { PassengerEntity } from '../passenger/entities/passengers.entity';
import { Driver } from '../driver/entities/driver.entity';

import { OtpService } from '../otp/otp.service';
import { MailModule } from '../mail/mail.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { PassengerGuard } from '../common/guards/passenger.guard';
import { HtmlService } from '../common/services/html.service';
import { UnverifiedCleanupTask } from './tasks/unverified-cleanup.task';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PassengerEntity, Driver]),
    PassportModule,
    JwtModule.register({}),
    ScheduleModule.forRoot(),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthPasswordService,
    AuthProfileService,
    AuthEmailChangeService,
    AuthPasskeyService,
    AuthAccountService,
    OtpService,
    PassengerGuard,
    JwtStrategy,
    JwtRefreshStrategy,
    HtmlService,
    UnverifiedCleanupTask,
  ],
  exports: [AuthService, AuthPasswordService, AuthPasskeyService],
})
export class AuthModule {}
