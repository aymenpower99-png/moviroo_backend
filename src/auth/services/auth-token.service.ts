import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../../users/entites/user.entity';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface PreAuthPayload {
  sub: string;
  email: string;
  preAuth: true;
  method: 'email' | 'totp';
}

@Injectable()
export class AuthTokenService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async generateTokens(user: User, rememberMe = true) {
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
        expiresIn: rememberMe ? '30d' : '1h',
      }),
    ]);
    return { accessToken, refreshToken };
  }

  async saveRefreshToken(userId: string, token: string) {
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
      actionTokenExpiry,
      ...safe
    } = user;
    return { ...safe, emailChangePending: !!safe.pendingEmail };
  }

  async issuePreAuthToken(user: User, method: 'email' | 'totp') {
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

  parseJwt(token: string): Record<string, unknown> {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload) as Record<string, unknown>;
  }

  async generateVerifyEmailToken(userId: string) {
    return this.jwtService.signAsync(
      { sub: userId, purpose: 'verify-email' },
      {
        secret: this.config.get<string>('jwt.accessSecret')!,
        expiresIn: '30m',
      },
    );
  }

  async verifyPreAuthToken(token: string): Promise<PreAuthPayload> {
    try {
      return await this.jwtService.verifyAsync<PreAuthPayload>(token, {
        secret: this.config.get<string>('jwt.accessSecret')!,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired pre-auth token');
    }
  }
}
