import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  HttpCode,
  Patch,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  VerifyOtpDto,
  ResendOtpDto,
  VerifyMagicLinkDto,
  Toggle2faDto,
} from './dto/verify-otp.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entites/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ─── Register ─────────────────────────────────────────────────────────────

  /** POST /auth/register → returns { requiresOtp, userId } */
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ─── Verify Email (after register) ───────────────────────────────────────

  /** POST /auth/verify-email → submit 6-digit code from email */
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyEmail(dto.userId, dto.code);
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  /** POST /auth/login → if 2FA off: tokens. If 2FA on: { requiresOtp, preAuthToken } */
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** POST /auth/login/verify-otp → step 2 when 2FA is ON */
  @Post('login/verify-otp')
  @HttpCode(200)
  verifyLoginOtp(@Body() body: { preAuthToken: string; code: string }) {
    return this.authService.verifyLoginOtp(body.preAuthToken, body.code);
  }

  // ─── Resend OTP ───────────────────────────────────────────────────────────

  /** POST /auth/resend-otp */
  @Post('resend-otp')
  @HttpCode(200)
  resendOtp(
    @Body() dto: ResendOtpDto,
    @Query('purpose') purpose: 'verify-email' | 'login' = 'verify-email',
  ) {
    return this.authService.resendOtp(dto.userId, purpose);
  }

  // ─── Magic Link ───────────────────────────────────────────────────────────

  /** POST /auth/magic-link → request a magic sign-in link */
  @Post('magic-link')
  @HttpCode(200)
  requestMagicLink(@Body() body: { email: string }) {
    return this.authService.requestMagicLink(body.email);
  }

  /** GET /auth/magic-link/verify?token=xxx → user clicks link from email */
  @Get('magic-link/verify')
  verifyMagicLink(@Query('token') token: string) {
    return this.authService.verifyMagicLink(token);
  }

  // ─── 2FA Settings (requires login) ───────────────────────────────────────

  /** PATCH /auth/2fa → { enabled: true/false } from the settings screen */
  @Patch('2fa')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  toggle2fa(
    @CurrentUser() user: User,
    @Body() dto: Toggle2faDto,
  ) {
    return this.authService.toggle2fa(user.id, dto.enabled);
  }

  // ─── Refresh / Logout / Me (unchanged) ───────────────────────────────────

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
    const { password, refreshToken, otpCode, magicLinkToken, ...safe } = user;
    return safe;
  }
}