import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  HttpCode,
  Patch,
  Query,
  Delete,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto, ResendOtpDto, Toggle2faDto } from './dto/verify-otp.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entites/user.entity';
import { PassengerGuard } from '../common/guards/passenger.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ─── Register ─────────────────────────────────────────────────────────────

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ─── Verify Email ─────────────────────────────────────────────────────────

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyEmail(dto.userId, dto.code);
  }

  // ─── Login ────────────────────────────────────────────────────────────────

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

  // ─── Resend OTP ───────────────────────────────────────────────────────────

  @Post('resend-otp')
  @HttpCode(200)
  resendOtp(
    @Body() dto: ResendOtpDto,
    @Query('purpose') purpose: 'verify-email' | 'login' = 'verify-email',
  ) {
    return this.authService.resendOtp(dto.userId, purpose);
  }

  // ─── TOTP Setup (passengers only) ────────────────────────────────────────

  @Post('2fa/totp/setup')
  @UseGuards(AuthGuard('jwt'), PassengerGuard)
  @HttpCode(200)
  setupTotp(@CurrentUser() user: User) {
    return this.authService.setupTotp(user);
  }

  @Post('2fa/totp/confirm')
  @UseGuards(AuthGuard('jwt'), PassengerGuard)
  @HttpCode(200)
  confirmTotpSetup(
    @CurrentUser() user: User,
    @Body() body: { code: string },
  ) {
    return this.authService.confirmTotpSetup(user.id, body.code);
  }

  @Delete('2fa/totp')
  @UseGuards(AuthGuard('jwt'), PassengerGuard)
  @HttpCode(200)
  disableTotp(@CurrentUser() user: User) {
    return this.authService.disableTotp(user.id);
  }

  // ─── Email 2FA ────────────────────────────────────────────────────────────

  @Patch('2fa')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  toggle2fa(@CurrentUser() user: User, @Body() dto: Toggle2faDto) {
    return this.authService.toggle2fa(user.id, dto.enabled);
  }

  // ─── Refresh / Logout / Me ────────────────────────────────────────────────

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

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  me(@CurrentUser() user: User) {
    const { password, refreshToken, otpCode, totpSecret, ...safe } = user;
    return safe;
  }
}