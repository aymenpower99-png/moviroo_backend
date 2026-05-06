import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  User,
  UserRole,
  UserStatus,
  TwoFactorMethod,
} from '../../users/entites/user.entity';
import { Driver } from '../../driver/entities/driver.entity';
import { LoginDto, AppType } from '../dto/login.dto';
import { AdminLoginDto } from '../dto/admin-login.dto';
import { OtpService } from '../../otp/otp.service';
import { AuthMailService } from '../../mail/services/auth-mail.service';
import { AuthTokenService, PreAuthPayload } from './auth-token.service';

@Injectable()
export class AuthLoginService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Driver) private readonly driverRepo: Repository<Driver>,
    private readonly otpService: OtpService,
    private readonly authMail: AuthMailService,
    private readonly tokenService: AuthTokenService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user || !user.password)
      throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.emailVerified) {
      const verifyToken = await this.tokenService.generateVerifyEmailToken(
        user.id,
      );
      await this.authMail.sendVerifyEmailLink(
        user.email,
        user.firstName,
        verifyToken,
      );
      return {
        message:
          'Please verify your email first. A new verification link has been sent.',
        requiresVerification: true,
        stage: 'verify-email',
        userId: user.id,
      };
    }

    if (user.status === UserStatus.BLOCKED)
      throw new ForbiddenException(
        'Your account has been blocked. Please contact support.',
      );

    if (dto.appType === AppType.DRIVER && user.role !== UserRole.DRIVER) {
      throw new ForbiddenException(
        'Access denied. This app is for drivers only.',
      );
    }

    if (dto.appType === AppType.PASSENGER && user.role !== UserRole.PASSENGER) {
      throw new ForbiddenException(
        'Access denied. This app is for passengers only.',
      );
    }

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

    const preferredMethod: TwoFactorMethod | null =
      user.primary2faMethod ??
      (user.totpEnabled
        ? TwoFactorMethod.TOTP
        : user.is2faEnabled
          ? TwoFactorMethod.EMAIL
          : null);

    if (preferredMethod === TwoFactorMethod.TOTP && user.totpEnabled) {
      const preAuthToken = await this.tokenService.issuePreAuthToken(
        user,
        'totp',
      );
      return {
        message: 'Enter the code from your authenticator app.',
        requiresOtp: true,
        stage: 'login-totp',
        userId: user.id,
        preAuthToken,
      };
    }

    if (preferredMethod === TwoFactorMethod.EMAIL && user.is2faEnabled) {
      const code = await this.otpService.generateOtp(user.id);
      await this.authMail.sendOtp(user.email, user.firstName, code, 'login');
      const preAuthToken = await this.tokenService.issuePreAuthToken(
        user,
        'email',
      );
      return {
        message: 'Check your email for a verification code.',
        requiresOtp: true,
        stage: 'login-otp',
        userId: user.id,
        email: user.email,
        preAuthToken,
      };
    }

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    const tokens = await this.tokenService.generateTokens(user);
    await this.tokenService.saveRefreshToken(user.id, tokens.refreshToken);
    return { ...tokens, user: this.tokenService.safeUser(user) };
  }

  async adminLogin(dto: AdminLoginDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user || !user.password)
      throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.role !== UserRole.SUPER_ADMIN)
      throw new ForbiddenException('Access denied. Admin accounts only.');

    if (user.status === UserStatus.BLOCKED)
      throw new ForbiddenException(
        'Your account has been blocked. Please contact support.',
      );

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    const tokens = await this.tokenService.generateTokens(user);
    await this.tokenService.saveRefreshToken(user.id, tokens.refreshToken);
    return { ...tokens, user: this.tokenService.safeUser(user) };
  }

  async verifyLoginOtp(preAuthToken: string, code: string) {
    const payload = await this.tokenService.verifyPreAuthToken(preAuthToken);

    if (!payload.preAuth) throw new UnauthorizedException('Invalid token type');

    payload.method === 'totp'
      ? await this.otpService.verifyTotpCode(payload.sub, code)
      : await this.otpService.verifyOtp(payload.sub, code);

    const user = await this.userRepo.findOneOrFail({
      where: { id: payload.sub },
    });
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    const tokens = await this.tokenService.generateTokens(user);
    await this.tokenService.saveRefreshToken(user.id, tokens.refreshToken);
    return { ...tokens, user: this.tokenService.safeUser(user) };
  }

  async resendOtp(userId: string, purpose: 'verify-email' | 'login') {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    const code = await this.otpService.generateOtp(user.id);
    await this.authMail.sendOtp(user.email, user.firstName, code, purpose);
    return { message: 'A new verification code has been sent to your email.' };
  }

  async refresh(user: User) {
    const tokens = await this.tokenService.generateTokens(user);
    await this.tokenService.saveRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async logout(userId: string) {
    await this.userRepo.update(userId, { refreshToken: null });
    return { message: 'Logged out successfully' };
  }
}
