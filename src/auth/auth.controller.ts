import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthProfileService } from './auth-profile.service';
import { AuthEmailChangeService } from './auth-email-change.service';
import { HtmlService } from '../common/services/html.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyOtpDto, ResendOtpDto, Toggle2faDto } from './dto/verify-otp.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entites/user.entity';
import { PassengerGuard } from '../common/guards/passenger.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private profileService: AuthProfileService,
    private emailChangeService: AuthEmailChangeService,
    private htmlService: HtmlService,
  ) {}

  // ─── Register / Verify / Login ────────────────────────────────────────────

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyEmail(dto.userId, dto.code);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('login/verify-otp')
  @HttpCode(200)
  verifyLoginOtp(@Body() body: { preAuthToken: string; code: string }) {
    return this.authService.verifyLoginOtp(body.preAuthToken, body.code);
  }

  @Post('resend-otp')
  @HttpCode(200)
  resendOtp(
    @Body() dto: ResendOtpDto,
    @Query('purpose') purpose: 'verify-email' | 'login' = 'verify-email',
  ) {
    return this.authService.resendOtp(dto.userId, purpose);
  }

  // ─── Me / Profile ─────────────────────────────────────────────────────────

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  me(@CurrentUser() user: User) {
    return this.authService.safeUser(user);
  }

  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(user.id, dto);
  }

  // ─── Email Change ─────────────────────────────────────────────────────────

  @Get('email-change/confirm')
  async confirmEmailChange(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.emailChangeService.confirmEmailChange(token);
      this.htmlService.sendEmailChangeSuccess(result.newEmail, res);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'This verification link is no longer valid. Please request a new email change from the app.';
      this.htmlService.sendEmailChangeError(message, res);
    }
  }

  @Post('email-change/resend')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  resendEmailChange(@CurrentUser() user: User) {
    return this.emailChangeService.resendVerification(user.id);
  }

  @Delete('email-change')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  cancelEmailChange(@CurrentUser() user: User) {
    return this.emailChangeService.cancelEmailChange(user.id);
  }

  // ─── TOTP ─────────────────────────────────────────────────────────────────

  @Post('2fa/totp/setup')
  @UseGuards(AuthGuard('jwt'), PassengerGuard)
  @HttpCode(200)
  setupTotp(@CurrentUser() user: User) {
    return this.authService.setupTotp(user);
  }

  @Post('2fa/totp/confirm')
  @UseGuards(AuthGuard('jwt'), PassengerGuard)
  @HttpCode(200)
  confirmTotpSetup(@CurrentUser() user: User, @Body() body: { code: string }) {
    return this.authService.confirmTotpSetup(user.id, body.code);
  }

  @Delete('2fa/totp')
  @UseGuards(AuthGuard('jwt'), PassengerGuard)
  @HttpCode(200)
  disableTotp(@CurrentUser() user: User) {
    return this.authService.disableTotp(user.id);
  }

  // ─── Email 2FA ─────────────────────────────────────────────────────────────

  @Patch('2fa')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  toggle2fa(@CurrentUser() user: User, @Body() dto: Toggle2faDto) {
    return this.authService.toggle2fa(user.id, dto.enabled);
  }

  // ─── Refresh / Logout ─────────────────────────────────────────────────────

  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  @HttpCode(200)
  refresh(@CurrentUser() user: User) {
    return this.authService.refresh(user);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  logout(@CurrentUser() user: User) {
    return this.authService.logout(user.id);
  }
}
