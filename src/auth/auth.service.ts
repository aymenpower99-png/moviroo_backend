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
import { User, UserRole, UserStatus } from '../users/entites/user.entity';
import {
  Driver,
  DriverAvailabilityStatus,
} from '../driver/entities/driver.entity';
import {
  PassengerEntity,
  MembershipLevel,
} from '../passenger/entities/passengers.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OtpService } from '../otp/otp.service';
import { AuthMailService } from '../mail/services/auth-mail.service';
import { WelcomeMailService } from '../mail/services/welcome-mail.service';

// ── No VehicleType import — it no longer exists ──────────────────────────────

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
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
    @InjectRepository(Driver) private driverRepo: Repository<Driver>,
    @InjectRepository(PassengerEntity)
    private passengerRepo: Repository<PassengerEntity>,
    private jwtService: JwtService,
    private config: ConfigService,
    private otpService: OtpService,
    private authMail: AuthMailService,
    private welcomeMail: WelcomeMailService,
  ) {}

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
    await this.authMail.sendOtp(
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

  async verifyEmail(userId: string, code: string) {
    await this.otpService.verifyOtp(userId, code);
    await this.userRepo.update(userId, {
      emailVerified: true,
      status: UserStatus.ACTIVE,
    });

    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });

    if (user.role === UserRole.PASSENGER) {
      const exists = await this.passengerRepo.findOne({
        where: { userId: user.id },
      });
      if (!exists) {
        await this.passengerRepo.save(
          this.passengerRepo.create({
            userId: user.id,
            preferredClassId: null, // ← passenger picks class at booking time
            membershipLevel: MembershipLevel.GO,
            membershipPoints: 0,
            totalBookings: 0,
            ratingAverage: 5.0,
            totalRatings: 0,
            newsletterOptIn: false,
          }),
        );
      }
    } else if (user.role === UserRole.DRIVER) {
      const exists = await this.driverRepo.findOne({
        where: { userId: user.id },
      });
      if (!exists) {
        await this.driverRepo.save(
          this.driverRepo.create({
            userId: user.id,
            availabilityStatus: DriverAvailabilityStatus.OFFLINE,
            ratingAverage: 5.0,
            totalRatings: 0,
            totalTrips: 0,
          }),
        );
      }
    }

    // ✅ First real interaction for email/password registration → send welcome
    this.welcomeMail.sendWelcome(user.role, user.email, user.firstName);

    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return { ...tokens, user: this.safeUser(user) };
  }

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

    if (!user.emailVerified) {
      const code = await this.otpService.generateOtp(user.id);
      await this.authMail.sendOtp(
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
      await this.authMail.sendOtp(user.email, user.firstName, code, 'login');
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

  async resendOtp(userId: string, purpose: 'verify-email' | 'login') {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    const code = await this.otpService.generateOtp(user.id);
    await this.authMail.sendOtp(user.email, user.firstName, code, purpose);
    return { message: 'A new verification code has been sent to your email.' };
  }

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

  async toggle2fa(userId: string, enable: boolean) {
    await this.userRepo.update(userId, { is2faEnabled: enable });
    return {
      message: enable
        ? '2-step verification enabled.'
        : '2-step verification disabled.',
      is2faEnabled: enable,
    };
  }

  async refresh(user: User) {
    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async logout(userId: string) {
    await this.userRepo.update(userId, { refreshToken: null });
    return { message: 'Logged out successfully' };
  }

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
      role: user.role,
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
