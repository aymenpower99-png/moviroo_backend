import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from '../users/entites/user.entity'; // ← UserRole added
import { Driver } from '../driver/entities/driver.entity'; // ← NEW
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole; // ← ADD THIS
}
interface PreAuthPayload {
  sub: string;
  email: string;
  preAuth: true;
  method: 'email' | 'totp';
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Driver) private driverRepo: Repository<Driver>, // ← NEW
    private jwtService: JwtService,
    private config: ConfigService,
    private otpService: OtpService,
    private mailService: MailService,
  ) {}

  // ─── Register ─────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const exists = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = this.userRepo.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      password: hashed,
      status: UserStatus.PENDING,
    });
    await this.userRepo.save(user);

    const code = await this.otpService.generateOtp(user.id);
    await this.mailService.sendOtp(
      user.email,
      user.firstName,
      code,
      'verify-email',
    );

    return {
      message:
        'Registration successful. Check your email for a verification code.',
      requiresOtp: true,
      userId: user.id,
    };
  }

  // ─── Verify Email ─────────────────────────────────────────────────────────

  async verifyEmail(userId: string, code: string) {
    await this.otpService.verifyOtp(userId, code);
    await this.userRepo.update(userId, {
      emailVerified: true,
      status: UserStatus.ACTIVE,
    });

    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return { ...tokens, user: this.safeUser(user) };
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user || !user.password)
      throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.status === UserStatus.PENDING)
      throw new UnauthorizedException(
        'Please activate your account first. Check your invitation email.',
      );
    if (user.status === UserStatus.BLOCKED)
      throw new ForbiddenException(
        'Your account has been blocked. Please contact support.',
      );

    // ─── Driver readiness gate ───────────────────────────────────────────────
    // A driver who has accepted the invitation (ACTIVE) but whose profile has
    // not yet been created by the agency must not be allowed to log in.
    if (user.role === UserRole.DRIVER) {
      const driverProfile = await this.driverRepo.findOne({
        where: { userId: user.id },
      });
      if (!driverProfile) {
        throw new ForbiddenException(
          'Your account is being prepared by the agency.',
        );
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    if (!user.emailVerified) {
      const code = await this.otpService.generateOtp(user.id);
      await this.mailService.sendOtp(
        user.email,
        user.firstName,
        code,
        'verify-email',
      );
      return {
        message: 'Please verify your email first. A new code has been sent.',
        requiresOtp: true,
        stage: 'verify-email',
        userId: user.id,
      };
    }

    if (user.totpEnabled) {
      const preAuthToken = await this.issuePreAuthToken(user, 'totp');
      return {
        message: 'Enter the code from your authenticator app.',
        requiresOtp: true,
        stage: 'login-totp',
        preAuthToken,
      };
    }

    if (user.is2faEnabled) {
      const code = await this.otpService.generateOtp(user.id);
      await this.mailService.sendOtp(user.email, user.firstName, code, 'login');
      const preAuthToken = await this.issuePreAuthToken(user, 'email');
      return {
        message: 'Check your email for a verification code.',
        requiresOtp: true,
        stage: 'login-otp',
        preAuthToken,
      };
    }

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return { ...tokens, user: this.safeUser(user) };
  }

  // ─── Verify Login OTP ─────────────────────────────────────────────────────

  async verifyLoginOtp(preAuthToken: string, code: string) {
    let payload: PreAuthPayload;
    try {
      payload = await this.jwtService.verifyAsync<PreAuthPayload>(
        preAuthToken,
        {
          secret: this.config.get<string>('jwt.accessSecret')!,
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired pre-auth token');
    }

    if (!payload.preAuth) throw new UnauthorizedException('Invalid token type');

    payload.method === 'totp'
      ? await this.otpService.verifyTotpCode(payload.sub, code)
      : await this.otpService.verifyOtp(payload.sub, code);

    const user = await this.userRepo.findOneOrFail({
      where: { id: payload.sub },
    });
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

  // ─── TOTP ─────────────────────────────────────────────────────────────────

  async setupTotp(user: User) {
    return this.otpService.generateTotpSecret(user);
  }
  async confirmTotpSetup(userId: string, code: string) {
    await this.otpService.verifyAndEnableTotp(userId, code);
    return {
      message: 'Authenticator app linked successfully.',
      totpEnabled: true,
    };
  }
  async disableTotp(userId: string) {
    await this.otpService.disableTotp(userId);
    return { message: 'Authenticator app unlinked.', totpEnabled: false };
  }

  // ─── Toggle email 2FA ─────────────────────────────────────────────────────

  async toggle2fa(userId: string, enable: boolean) {
    await this.userRepo.update(userId, { is2faEnabled: enable });
    return {
      message: enable
        ? '2-step verification enabled. You will receive a code by email on each login.'
        : '2-step verification disabled.',
      is2faEnabled: enable,
    };
  }

  // ─── Refresh / Logout ─────────────────────────────────��───────────────────

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

  private async issuePreAuthToken(user: User, method: 'email' | 'totp') {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        preAuth: true,
        method,
      } satisfies PreAuthPayload,
      {
        secret: this.config.get<string>('jwt.accessSecret')!,
        expiresIn: '10m',
      },
    );
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role, // ← ADD THIS
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('jwt.accessSecret')!,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('jwt.refreshSecret')!,
        expiresIn: '7d',
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, token: string) {
    const hashed = await bcrypt.hash(token, 12);
    await this.userRepo.update(userId, { refreshToken: hashed });
  }

  safeUser(user: User) {
    const {
      password,
      refreshToken,
      otpCode,
      totpSecret,
      inviteToken,
      emailChangeToken,
      ...safe
    } = user;
    return { ...safe, emailChangePending: !!safe.pendingEmail };
  }
}
