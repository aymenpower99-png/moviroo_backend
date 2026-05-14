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
import { AuthBiometricService } from './auth-passkey.service';
import { AuthAccountService } from './auth-account.service';

import { AuthTokenService } from './services/auth-token.service';
import { AuthRegisterService } from './services/auth-register.service';
import { AuthLoginService } from './services/auth-login.service';
import { Auth2faService } from './services/auth-2fa.service';
import { AuthOAuthService } from './services/auth-oauth.service';
import { AuthSessionService } from './services/auth-session.service';
import { AuthWebAuthnService } from './services/auth-webauthn.service';

import { User } from '../users/entites/user.entity';
import { PassengerEntity } from '../passenger/entities/passengers.entity';
import { Driver } from '../driver/entities/driver.entity';
import { UserSession } from './entities/user-session.entity';
import { PasskeyCredential } from './entities/passkey-credential.entity';
import { UserConsent } from './entities/user-consent.entity';
import { Ride } from '../rides/domain/entities/ride.entity';
import { TripPayment } from '../billing/entities/trip-payment.entity';
import { SupportTicket } from '../support/entities/support-ticket.entity';

import { OtpService } from '../otp/otp.service';
import { MailModule } from '../mail/mail.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { PassengerGuard } from '../common/guards/passenger.guard';
import { SensitiveActionGuard } from './guards/sensitive-action.guard';
import { HtmlService } from '../common/services/html.service';
import { UnverifiedCleanupTask } from './tasks/unverified-cleanup.task';
import { AnonymizationService } from '../common/services/anonymization.service';
import { ConsentService } from './services/consent.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      PassengerEntity,
      Driver,
      UserSession,
      PasskeyCredential,
      UserConsent,
      Ride,
      TripPayment,
      SupportTicket,
    ]),
    PassportModule,
    JwtModule.register({}),
    ScheduleModule.forRoot(),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    // Core facade
    AuthService,
    // New sub-services
    AuthTokenService,
    AuthRegisterService,
    AuthLoginService,
    Auth2faService,
    AuthOAuthService,
    AuthSessionService,
    AuthWebAuthnService,
    // Existing sub-services
    AuthPasswordService,
    AuthProfileService,
    AuthEmailChangeService,
    AuthBiometricService,
    AuthAccountService,
    OtpService,
    PassengerGuard,
    SensitiveActionGuard,
    JwtStrategy,
    JwtRefreshStrategy,
    HtmlService,
    UnverifiedCleanupTask,
    AnonymizationService,
    ConsentService,
  ],
  exports: [
    AuthPasswordService,
    AuthBiometricService,
    AuthAccountService,
    AuthSessionService,
  ],
})
export class AuthModule {}
