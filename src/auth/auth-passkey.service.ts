import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '../users/entites/user.entity';

/**
 * Biometric Authentication (device-level biometric) flow.
 *
 * The BACKEND never stores biometric data. It only tracks:
 *   - passkeyEnabled: whether user opted-in on a trusted device
 *   - actionTokenExpiry: a short-lived timestamp proving a recent biometric challenge
 *
 * Short-lived JWT "action tokens" are issued after a successful biometric on the
 * client; sensitive endpoints (disable 2FA, change security, delete account)
 * require either:
 *   - a fresh password / OTP re-auth, OR
 *   - a fresh biometric action token
 */
export interface BiometricActionPayload {
  sub: string;
  kind: 'biometric-action';
  method: 'face' | 'fingerprint' | 'pin';
  /** Purpose this token was issued for — prevents cross-action reuse. */
  purpose: string;
}

const ACTION_TOKEN_TTL_SECONDS = 5 * 60; // 5 minutes

@Injectable()
export class AuthBiometricService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async enablePasskey(userId: string) {
    await this.userRepo.update(userId, { passkeyEnabled: true });
    return {
      message: 'Biometric Authentication enabled for this device.',
      passkeyEnabled: true,
    };
  }

  async disablePasskey(userId: string) {
    await this.userRepo.update(userId, {
      passkeyEnabled: false,
      actionTokenExpiry: null,
    });
    return {
      message: 'Biometric Authentication disabled.',
      passkeyEnabled: false,
    };
  }

  /**
   * Called by the client after a SUCCESSFUL local biometric prompt.
   * Returns a short-lived action token that proves a fresh challenge happened.
   * Sensitive endpoints can require this token as proof of re-auth.
   *
   * @param purpose  Scopes the token to a specific operation (e.g. 'disable-totp').
   *                 Prevents reuse across different sensitive actions.
   */
  async verifyPasskey(
    userId: string,
    method: 'face' | 'fingerprint' | 'pin',
    purpose = 'general',
  ) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    if (!user.passkeyEnabled) {
      throw new BadRequestException(
        'Biometric Authentication is not enabled for this user.',
      );
    }

    const expiry = new Date(Date.now() + ACTION_TOKEN_TTL_SECONDS * 1000);
    await this.userRepo.update(userId, { actionTokenExpiry: expiry });

    const actionToken = await this.jwtService.signAsync(
      {
        sub: userId,
        kind: 'biometric-action',
        method,
        purpose,
      } satisfies BiometricActionPayload,
      {
        secret: this.config.get<string>('jwt.accessSecret')!,
        expiresIn: `${ACTION_TOKEN_TTL_SECONDS}s`,
      },
    );

    return {
      actionToken,
      expiresInSeconds: ACTION_TOKEN_TTL_SECONDS,
    };
  }

  /**
   * Validates a biometric action token. Used by sensitive endpoints (delete,
   * disable 2FA, etc.) when the caller chooses biometric instead of password.
   *
   * @param expectedPurpose  When provided, rejects tokens issued for a
   *                         different purpose (prevents cross-action reuse).
   */
  async validateActionToken(
    userId: string,
    token: string,
    expectedPurpose?: string,
  ): Promise<void> {
    let payload: BiometricActionPayload;
    try {
      payload = await this.jwtService.verifyAsync<BiometricActionPayload>(
        token,
        {
          secret: this.config.get<string>('jwt.accessSecret')!,
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired biometric token');
    }

    if (payload.kind !== 'biometric-action' || payload.sub !== userId) {
      throw new UnauthorizedException('Invalid biometric token');
    }

    if (expectedPurpose && payload.purpose !== expectedPurpose) {
      throw new UnauthorizedException(
        'Action token was not issued for this operation',
      );
    }

    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    if (
      !user.actionTokenExpiry ||
      user.actionTokenExpiry.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Biometric challenge has expired');
    }
  }
}
