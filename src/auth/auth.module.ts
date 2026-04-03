import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController }         from './auth.controller';
import { AuthService }            from './auth.service';
import { AuthProfileService }     from './auth-profile.service';
import { AuthEmailChangeService } from './auth-email-change.service';

import { User }               from '../users/entites/user.entity';
import { PassengerEntity }    from '../passenger/entities/passengers.entity';
import { OtpService }         from '../otp/otp.service';
import { MailModule }         from '../mail/mail.module';
import { JwtStrategy }        from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { PassengerGuard }     from '../common/guards/passenger.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PassengerEntity]),
    PassportModule,
    JwtModule.register({}),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthProfileService,
    AuthEmailChangeService,
    OtpService,        // ← registered directly, no OtpModule exists
    PassengerGuard,
    JwtStrategy,
    JwtRefreshStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}