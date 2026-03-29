import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entites/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';

interface JwtPayload {
  sub:   string;
  email: string;
}

// Intermediate token issued after password check when 2FA is ON.
// Short-lived (10 min), only used to verify the OTP step.
interface PreAuthPayload {
  sub:     string;
  email:   string;
  preAuth: true;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService: JwtService,
    private config:     ConfigService,
    private otpService: OtpService,
    private mailService: MailService,
  ) {}

  // ─── Register ─────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const exists = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user   = this.userRepo.create({
      firstName: dto.firstName,
      lastName:  dto.lastName,
      email:     dto.email,
      phone:     dto.phone,
      password:  hashed,
    });
    await this.userRepo.save(user);

    // Always send email-verification OTP on register
    const code = await this.otpService.generateOtp(user.id);
    await this.mailService.sendOtp(user.email, user.firstName, code, 'verify-email');

    return {
      message:     'Registration successful. Check your email for a verification code.',
      requiresOtp: true,
      userId:      user.id,   // frontend needs this to call POST /auth/verify-email
    };
  }

  // ─── Verify Email (OTP after register) ────────────────────────────────────

  async verifyEmail(userId: string, code: string) {
    await this.otpService.verifyOtp(userId, code); // throws on bad/expired code

    await this.userRepo.update(userId, { emailVerified: true });

    const user   = await this.userRepo.findOneOrFail({ where: { id: userId } });
    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: this.safeUser(user),
    };
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.emailVerified) {
      // Re-send verification OTP and force them to verify first
      const code = await this.otpService.generateOtp(user.id);
      await this.mailService.sendOtp(user.email, user.firstName, code, 'verify-email');
      return {
        message:     'Please verify your email first. A new code has been sent.',
        requiresOtp: true,
        stage:       'verify-email',
        userId:      user.id,
      };
    }

    if (user.is2faEnabled) {
      // Step 1 of 2: issue short-lived pre-auth token, send OTP
      const code       = await this.otpService.generateOtp(user.id);
      await this.mailService.sendOtp(user.email, user.firstName, code, 'login');

      const preAuthToken = await this.jwtService.signAsync(
        { sub: user.id, email: user.email, preAuth: true } satisfies PreAuthPayload,
        {
          secret:    this.config.get<string>('jwt.accessSecret')!,
          expiresIn: '10m',
        },
      );

      return {
        message:      'Check your email for a verification code.',
        requiresOtp:  true,
        stage:        'login-otp',
        preAuthToken, // frontend sends this back with the OTP code
      };
    }

    // No 2FA → issue full tokens immediately
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { ...tokens, user: this.safeUser(user) };
  }

  // ─── Verify Login OTP (step 2 when 2FA is ON) ─────────────────────────────

  async verifyLoginOtp(preAuthToken: string, code: string) {
    let payload: PreAuthPayload;
    try {
      payload = await this.jwtService.verifyAsync<PreAuthPayload>(preAuthToken, {
        secret: this.config.get<string>('jwt.accessSecret')!,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired pre-auth token');
    }

    if (!payload.preAuth) throw new UnauthorizedException('Invalid token type');

    await this.otpService.verifyOtp(payload.sub, code); // throws on bad code

    const user = await this.userRepo.findOneOrFail({ where: { id: payload.sub } });
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { ...tokens, user: this.safeUser(user) };
  }

  // ─── Resend OTP ───────────────────────────────────────────────────────────

  async resendOtp(userId: string, purpose: 'verify-email' | 'login') {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const code = await this.otpService.generateOtp(user.id);
    await this.mailService.sendOtp(user.email, user.firstName, code, purpose);

    return { message: 'A new verification code has been sent to your email.' };
  }

  // ─── Magic Link ───────────────────────────────────────────────────────────

  async requestMagicLink(email: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    // Always return same message to prevent email enumeration
    if (!user) return { message: 'If that email exists, a magic link has been sent.' };

    const token = await this.otpService.generateMagicToken(user.id);
    await this.mailService.sendMagicLink(user.email, user.firstName, token);

    return { message: 'If that email exists, a magic link has been sent.' };
  }

  async verifyMagicLink(rawToken: string) {
    const user = await this.otpService.verifyMagicToken(rawToken); // throws on bad/expired

    if (!user.emailVerified) {
      await this.userRepo.update(user.id, { emailVerified: true });
    }

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { ...tokens, user: this.safeUser(user) };
  }

  // ─── Toggle 2FA (from settings screen) ───────────────────────────────────

  async toggle2fa(userId: string, enable: boolean) {
    await this.userRepo.update(userId, { is2faEnabled: enable });
    return {
      message: enable
        ? '2-step verification enabled. You will receive a code by email on each login.'
        : '2-step verification disabled.',
      is2faEnabled: enable,
    };
  }

  // ─── Refresh / Logout / Me (unchanged) ───────────────────────────────────

  async refresh(user: User) {
    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async logout(userId: string) {
    await this.userRepo.update(userId, { refreshToken: null });
    return { message: 'Logged out successfully' };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async generateTokens(user: User) {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret:    this.config.get<string>('jwt.accessSecret')!,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret:    this.config.get<string>('jwt.refreshSecret')!,
        expiresIn: '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, token: string) {
    const hashed = await bcrypt.hash(token, 12);
    await this.userRepo.update(userId, { refreshToken: hashed });
  }

  private safeUser(user: User) {
    const { password, refreshToken, otpCode, magicLinkToken, ...safe } = user;
    return safe;
  }
}