import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { AuthProfileService } from './auth-profile.service';
import { AuthEmailChangeService } from './auth-email-change.service';
import { AuthPasswordService } from './auth-password.service';
import { AuthBiometricService } from './auth-passkey.service';
import { AuthAccountService } from './auth-account.service';
import { AuthSessionService } from './services/auth-session.service';
import { AuthWebAuthnService } from './services/auth-webauthn.service';

import { HtmlService } from '../common/services/html.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyOtpDto, ResendOtpDto, Toggle2faDto } from './dto/verify-otp.dto';

import { AdminLoginDto } from './dto/admin-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { GoogleSignInDto } from './dto/google-signin.dto';
import {
  SwitchPrimary2faDto,
  DeleteAccountDto,
  PasskeyVerifyDto,
} from './dto/security.dto';
import { WebAuthnRegisterStartDto } from './dto/webauthn-register-start.dto';
import { WebAuthnRegisterFinishDto } from './dto/webauthn-register-finish.dto';
import { WebAuthnAuthenticateStartDto } from './dto/webauthn-authenticate-start.dto';
import { WebAuthnAuthenticateFinishDto } from './dto/webauthn-authenticate-finish.dto';
import { RenamePasskeyDto } from './dto/rename-passkey.dto';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entites/user.entity';
import { PassengerGuard } from '../common/guards/passenger.guard';
import { SensitiveActionGuard } from './guards/sensitive-action.guard';
import { ActionPurpose } from './decorators/action-purpose.decorator';

@Controller('auth')
export class AuthController {
  /**
   * Captures the real client IP address by checking multiple headers.
   * This handles scenarios where the app is behind a proxy (ngrok, nginx, load balancer).
   */
  private getRealIp(req: Request): string | undefined {
    // Check X-Forwarded-For header (can contain multiple IPs: "client, proxy1, proxy2")
    const forwarded = req.headers['x-forwarded-for'] as string;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    // Check X-Real-IP header (common with nginx)
    const realIp = req.headers['x-real-ip'] as string;
    if (realIp) {
      return realIp;
    }

    // Fall back to req.ip
    return req.ip ?? undefined;
  }
  constructor(
    private authService: AuthService,
    private profileService: AuthProfileService,
    private emailChangeService: AuthEmailChangeService,
    private passwordService: AuthPasswordService,
    private biometricService: AuthBiometricService,
    private accountService: AuthAccountService,
    private sessionService: AuthSessionService,
    private htmlService: HtmlService,
    private webauthnService: AuthWebAuthnService,
  ) {}

  // ─── Register / Verify / Login ────────────────────────────────────────────

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token: string, @Res() res: Response) {
    try {
      const result = await this.authService.verifyEmailByToken(token);
      // If email already verified, show simple success page without tokens
      if ('accessToken' in result && 'refreshToken' in result) {
        this.htmlService.sendVerifyEmailSuccess(
          result.accessToken,
          result.refreshToken,
          res,
        );
      } else {
        this.htmlService.sendVerifyEmailSuccessSimple(res);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'This verification link is no longer valid. Please register again.';
      this.htmlService.sendVerifyEmailError(message, res);
    }
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const deviceLabel = (req.headers['x-device-name'] as string) ?? 'Unknown';
    const ipAddress = this.getRealIp(req);
    return this.authService.login(dto, deviceLabel, ipAddress);
  }

  @Post('admin/login')
  @HttpCode(200)
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.authService.adminLogin(dto);
  }

  @Post('login/verify-otp')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  verifyLoginOtp(
    @Body() body: { preAuthToken: string; code: string },
    @Req() req: Request,
  ) {
    const deviceLabel = (req.headers['x-device-name'] as string) ?? 'Unknown';
    const ipAddress = this.getRealIp(req);
    return this.authService.verifyLoginOtp(
      body.preAuthToken,
      body.code,
      deviceLabel,
      ipAddress,
    );
  }

  @Post('resend-otp')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  resendOtp(
    @Body() dto: ResendOtpDto,
    @Query('purpose') purpose: 'verify-email' | 'login' = 'verify-email',
  ) {
    return this.authService.resendOtp(dto.userId, purpose);
  }

  @Post('resend-verification')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  resendVerification(@Body() body: { email: string }) {
    return this.authService.resendVerification(body.email);
  }

  // ─── OAuth: Google ────────────────────────────────────────────────────────

  @Post('google')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  googleSignIn(@Body() dto: GoogleSignInDto, @Req() req: Request) {
    const deviceLabel = (req.headers['x-device-name'] as string) ?? 'Unknown';
    const ipAddress = this.getRealIp(req);
    return this.authService.googleSignIn(dto, deviceLabel, ipAddress);
  }

  // ─── Forgot / Reset / Update Password ────────────────────────────────────

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordService.forgotPassword(dto.email);
  }

  // GET: render the HTML reset form (link from email opens this)
  @Get('reset-password')
  resetPasswordForm(@Res() res: Response) {
    this.htmlService.sendResetPasswordForm(res);
  }

  // GET: success page (redirected to after JS fetch succeeds)
  @Get('reset-password/success')
  resetPasswordSuccess(@Res() res: Response) {
    this.htmlService.sendResetPasswordSuccess(res);
  }

  // POST: JSON API — used by both the React frontend and the backend HTML form
  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordService.resetPassword(dto.token, dto.newPassword);
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

  // ── ✅ NEW: Update password from Settings panel ──────────────────────────
  @Patch('me/password')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  updatePassword(@CurrentUser() user: User, @Body() dto: UpdatePasswordDto) {
    return this.passwordService.updatePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
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
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  setupTotp(@CurrentUser() user: User) {
    return this.authService.setupTotp(user);
  }

  @Post('2fa/totp/confirm')
  @UseGuards(AuthGuard('jwt'), PassengerGuard)
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  confirmTotpSetup(@CurrentUser() user: User, @Body() body: { code: string }) {
    return this.authService.confirmTotpSetup(user.id, body.code);
  }

  @Delete('2fa/totp')
  @UseGuards(AuthGuard('jwt'), PassengerGuard, SensitiveActionGuard)
  @ActionPurpose('disable-totp')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  disableTotp(@CurrentUser() user: User, @Body() body: { code: string }) {
    return this.authService.disableTotp(user.id, body.code);
  }

  // ─── Email 2FA ─────────────────────────────────────────────────────────────

  @Patch('2fa')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  toggle2fa(@CurrentUser() user: User, @Body() dto: Toggle2faDto) {
    return this.authService.toggle2fa(user.id, dto.enabled, dto.otp);
  }

  // ─── 2FA: Enable email 2FA — request OTP ──────────────────────────────────

  @Post('2fa/email/request-otp')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  requestEmail2faEnableOtp(@CurrentUser() user: User) {
    return this.authService.sendEmail2faEnableOtp(user.id);
  }

  // ─── 2FA: Primary method switching ─────────────────────────────────────────

  @Post('2fa/primary/email/request-otp')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  requestPrimarySwitchEmailOtp(@CurrentUser() user: User) {
    return this.authService.sendPrimarySwitchEmailOtp(user.id);
  }

  @Patch('2fa/primary')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  switchPrimary2fa(
    @CurrentUser() user: User,
    @Body() dto: SwitchPrimary2faDto,
  ) {
    return this.authService.switchPrimary2faMethod(
      user.id,
      dto.method,
      dto.code,
    );
  }

  // ─── Passkey (device biometric) ─────────────────────────────────────────────

  @Post('passkey/enable')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  enablePasskey(@CurrentUser() user: User) {
    return this.biometricService.enablePasskey(user.id);
  }

  @Delete('passkey')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  disablePasskey(@CurrentUser() user: User) {
    return this.biometricService.disablePasskey(user.id);
  }

  /**
   * Called AFTER a successful local Face ID / Fingerprint / PIN prompt on device.
   * Returns a short-lived action token usable for sensitive operations (delete,
   * disable 2FA, etc.).
   */
  @Post('passkey/verify')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  verifyPasskey(@CurrentUser() user: User, @Body() dto: PasskeyVerifyDto) {
    return this.biometricService.verifyPasskey(
      user.id,
      dto.method,
      dto.purpose ?? 'general',
    );
  }

  // ─── Delete account ─────────────────────────────────────────────────────────

  @Post('me/delete/request-otp')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  requestDeleteOtp(@CurrentUser() user: User) {
    return this.accountService.requestDeleteOtp(user.id);
  }

  @Delete('me')
  @UseGuards(AuthGuard('jwt'))
  @ActionPurpose('delete-account')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  deleteAccount(@CurrentUser() user: User, @Body() dto: DeleteAccountDto) {
    return this.accountService.deleteAccount(user.id, dto);
  }

  // ─── Active Sessions ───────────────────────────────────────────────────────

  /** Lists the user's recent login sessions (last 10). */
  @Get('sessions')
  @UseGuards(AuthGuard('jwt'))
  getSessions(@CurrentUser() user: User) {
    return this.sessionService.getSessions(user.id);
  }

  /**
   * Signs out ALL devices by clearing the refresh token and deleting all
   * session records. The user must log in again on every device.
   */
  @Delete('sessions')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  revokeAllSessions(@CurrentUser() user: User) {
    return this.sessionService.revokeAllSessions(user.id);
  }

  /**
   * Removes a single session record (audit cleanup).
   * Note: does NOT invalidate the refresh token for that device —
   * use DELETE /auth/sessions to fully sign out all devices.
   */
  @Delete('sessions/:id')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  async deleteSession(
    @CurrentUser() user: User,
    @Param('id') sessionId: string,
  ) {
    await this.sessionService.deleteSession(user.id, sessionId);
    return { message: 'Session removed.' };
  }

  // ─── WebAuthn Passkeys (FIDO2) ────────────────────────────────────────────

  @Post('passkeys/register/start')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  startPasskeyRegistration(
    @CurrentUser() user: User,
    @Body() dto: WebAuthnRegisterStartDto,
  ) {
    return this.webauthnService.startRegistration(user, dto.deviceName);
  }

  @Post('passkeys/register/finish')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  finishPasskeyRegistration(
    @CurrentUser() user: User,
    @Body() dto: WebAuthnRegisterFinishDto,
  ) {
    return this.webauthnService.finishRegistration(user, dto);
  }

  @Post('passkeys/authenticate/start')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  startPasskeyAuthentication(@Body() dto: WebAuthnAuthenticateStartDto) {
    return this.webauthnService.startAuthentication(dto);
  }

  @Post('passkeys/authenticate/finish')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  finishPasskeyAuthentication(
    @Body() dto: WebAuthnAuthenticateFinishDto,
    @Req() req: Request,
  ) {
    const deviceLabel = (req.headers['x-device-name'] as string) ?? 'Unknown';
    const ipAddress = this.getRealIp(req);
    return this.webauthnService.finishAuthentication(
      dto,
      deviceLabel,
      ipAddress,
    );
  }

  @Get('passkeys')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  listPasskeys(@CurrentUser() user: User) {
    return this.webauthnService.listPasskeys(user.id);
  }

  @Delete('passkeys/:id')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  async deletePasskey(
    @CurrentUser() user: User,
    @Param('id') passkeyId: string,
  ) {
    return this.webauthnService.deletePasskey(user.id, passkeyId);
  }

  @Patch('passkeys/:id')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(200)
  renamePasskey(
    @CurrentUser() user: User,
    @Param('id') passkeyId: string,
    @Body() dto: RenamePasskeyDto,
  ) {
    return this.webauthnService.renamePasskey(
      user.id,
      passkeyId,
      dto.deviceName,
    );
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
