import { Injectable } from '@nestjs/common';
import { User } from '../users/entites/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { GoogleSignInDto } from './dto/google-signin.dto';
import { TwoFactorMethod } from '../users/entites/user.entity';
import { AuthTokenService } from './services/auth-token.service';
import { AuthRegisterService } from './services/auth-register.service';
import { AuthLoginService } from './services/auth-login.service';
import { Auth2faService } from './services/auth-2fa.service';
import { AuthOAuthService } from './services/auth-oauth.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly tokenService: AuthTokenService,
    private readonly registerService: AuthRegisterService,
    private readonly loginService: AuthLoginService,
    private readonly twoFaService: Auth2faService,
    private readonly oauthService: AuthOAuthService,
  ) {}

  // ─── Register ─────────────────────────────────────────────────────────────

  register(dto: RegisterDto) {
    return this.registerService.register(dto);
  }

  verifyEmailByToken(token: string) {
    return this.registerService.verifyEmailByToken(token);
  }

  resendVerification(email: string) {
    return this.registerService.resendVerification(email);
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  login(dto: LoginDto) {
    return this.loginService.login(dto);
  }

  adminLogin(dto: AdminLoginDto) {
    return this.loginService.adminLogin(dto);
  }

  verifyLoginOtp(preAuthToken: string, code: string) {
    return this.loginService.verifyLoginOtp(preAuthToken, code);
  }

  resendOtp(userId: string, purpose: 'verify-email' | 'login') {
    return this.loginService.resendOtp(userId, purpose);
  }

  refresh(user: User) {
    return this.loginService.refresh(user);
  }

  logout(userId: string) {
    return this.loginService.logout(userId);
  }

  // ─── 2FA ──────────────────────────────────────────────────────────────────

  setupTotp(user: User) {
    return this.twoFaService.setupTotp(user);
  }

  confirmTotpSetup(userId: string, code: string) {
    return this.twoFaService.confirmTotpSetup(userId, code);
  }

  disableTotp(userId: string) {
    return this.twoFaService.disableTotp(userId);
  }

  toggle2fa(userId: string, enable: boolean, otp?: string) {
    return this.twoFaService.toggle2fa(userId, enable, otp);
  }

  switchPrimary2faMethod(
    userId: string,
    method: TwoFactorMethod,
    verificationCode: string,
  ) {
    return this.twoFaService.switchPrimary2faMethod(
      userId,
      method,
      verificationCode,
    );
  }

  sendEmail2faEnableOtp(userId: string) {
    return this.twoFaService.sendEmail2faEnableOtp(userId);
  }

  sendPrimarySwitchEmailOtp(userId: string) {
    return this.twoFaService.sendPrimarySwitchEmailOtp(userId);
  }

  // ─── OAuth ────────────────────────────────────────────────────────────────

  googleSignIn(dto: GoogleSignInDto) {
    return this.oauthService.googleSignIn(dto);
  }

  // ─── Shared ───────────────────────────────────────────────────────────────

  safeUser(user: User) {
    return this.tokenService.safeUser(user);
  }
}

