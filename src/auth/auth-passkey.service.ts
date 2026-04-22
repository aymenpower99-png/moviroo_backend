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
 * Passkey (device-level biometric) flow.
 *
 * The BACKEND never stores biometric data. It only tracks:
 *   - passkeyEnabled: whether user opted-in on a trusted device
 *   - actionTokenExpiry: a short-lived timestamp proving a recent biometric challenge
 *
 * Short-lived JWT "action tokens" are issued after a successful biometric on the
 * client; sensitive endpoints (disable 2FA, change security, delete account)
 * require either:
 *   - a fresh password / OTP re-auth, OR
 *   - a fresh passkey action token
 */
export interface PasskeyActionPayload {
  sub: string;
  kind: 'passkey-action';
  method: 'face' | 'fingerprint' | 'pin';
}

const ACTION_TOKEN_TTL_SECONDS = 5 * 60; // 5 minutes

@Injectable()
export class AuthPasskeyService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async enablePasskey(userId: string) {
    await this.userRepo.update(userId, { passkeyEnabled: true });
    return { message: 'Passkey enabled for this device.', passkeyEnabled: true };
  }

  async disablePasskey(userId: string) {
    await this.userRepo.update(userId, {
      passkeyEnabled: false,
      actionTokenExpiry: null,
    });
    return { message: 'Passkey disabled.', passkeyEnabled: false };
  }

  /**
   * Called by the client after a SUCCESSFUL local biometric prompt.
   * Returns a short-lived action token that proves a fresh challenge happened.
   * Sensitive endpoints can require this token as proof of re-auth.
   */
  async verifyPasskey(
    userId: string,
    method: 'face' | 'fingerprint' | 'pin',
  ) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    if (!user.passkeyEnabled) {
      throw new BadRequestException('Passkey is not enabled for this user.');
    }

    const expiry = new Date(Date.now() + ACTION_TOKEN_TTL_SECONDS * 1000);
    await this.userRepo.update(userId, { actionTokenExpiry: expiry });

    const actionToken = await this.jwtService.signAsync(
      {
        sub: userId,
        kind: 'passkey-action',
        method,
      } satisfies PasskeyActionPayload,
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
   * Validates a passkey action token. Used by sensitive endpoints (delete,
   * disable 2FA, etc.) when the caller chooses passkey instead of password.
   */
  async validateActionToken(userId: string, token: string): Promise<void> {
    let payload: PasskeyActionPayload;
    try {
      payload = await this.jwtService.verifyAsync<PasskeyActionPayload>(token, {
        secret: this.config.get<string>('jwt.accessSecret')!,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired passkey token');
    }

    if (payload.kind !== 'passkey-action' || payload.sub !== userId) {
      throw new UnauthorizedException('Invalid passkey token');
    }

    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    if (
      !user.actionTokenExpiry ||
      user.actionTokenExpiry.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Passkey challenge has expired');
    }
  }
}
