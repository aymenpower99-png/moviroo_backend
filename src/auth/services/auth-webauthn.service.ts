import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Interval } from '@nestjs/schedule';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';

import { User } from '../../users/entites/user.entity';
import { PasskeyCredential } from '../entities/passkey-credential.entity';
import { AuthTokenService } from './auth-token.service';
import { AuthSessionService } from './auth-session.service';

@Injectable()
export class AuthWebAuthnService {
  /** In-memory challenge store with TTL. Key = optionsId or userId. */
  private challenges = new Map<
    string,
    { challenge: string; userId?: string; expiresAt: Date }
  >();

  constructor(
    @InjectRepository(PasskeyCredential)
    private readonly passkeyRepo: Repository<PasskeyCredential>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly tokenService: AuthTokenService,
    private readonly sessionService: AuthSessionService,
    private readonly config: ConfigService,
  ) {}

  private getRpConfig() {
    return {
      rpName: 'Moviroo',
      rpID:
        this.config.get<string>('app.webauthnRpId') ??
        process.env.WEBAUTHN_RP_ID ??
        'moviroo.tn',
      origin:
        this.config.get<string>('app.webauthnOrigin') ??
        process.env.WEBAUTHN_ORIGIN ??
        'https://moviroo.tn',
    };
  }

  private setChallenge(
    key: string,
    challenge: string,
    userId?: string,
    ttlMs = 120000,
  ) {
    this.challenges.set(key, {
      challenge,
      userId,
      expiresAt: new Date(Date.now() + ttlMs),
    });
  }

  private getChallenge(key: string): { challenge: string; userId?: string } | null {
    const entry = this.challenges.get(key);
    if (!entry) return null;
    if (entry.expiresAt < new Date()) {
      this.challenges.delete(key);
      return null;
    }
    return { challenge: entry.challenge, userId: entry.userId };
  }

  /**
   * Extracts the origin from the clientDataJSON in the WebAuthn response.
   * For Android apps, CredentialManager sends `android:apk-key-hash:<hash>`.
   * We accept the platform-reported origin so verification works for both
   * mobile (Android/iOS) and web clients.
   */
  private getExpectedOriginFromResponse(response: { clientDataJSON?: string }): string {
    const configuredOrigin =
      this.config.get<string>('app.webauthnOrigin') ??
      process.env.WEBAUTHN_ORIGIN ??
      'https://moviroo.tn';

    if (!response.clientDataJSON) {
      return configuredOrigin;
    }

    try {
      const clientData = JSON.parse(
        Buffer.from(response.clientDataJSON, 'base64url').toString('utf-8'),
      ) as { origin?: string };

      const actualOrigin = clientData.origin;
      if (actualOrigin && actualOrigin.startsWith('android:apk-key-hash:')) {
        // Android native app origin — trust the platform-reported value
        return actualOrigin;
      }
      // For web or other origins, enforce the configured origin
      return configuredOrigin;
    } catch {
      return configuredOrigin;
    }
  }

  /** Clean up expired challenges every 60 seconds. */
  @Interval(60000)
  cleanupExpiredChallenges() {
    const now = new Date();
    for (const [key, entry] of this.challenges) {
      if (entry.expiresAt < now) this.challenges.delete(key);
    }
  }

  // ─── Registration ───────────────────────────────────────────────────────────

  async startRegistration(user: User, deviceName?: string) {
    const { rpName, rpID } = this.getRpConfig();

    const existing = await this.passkeyRepo.find({
      where: { userId: user.id },
    });

    const excludeCredentials = existing.map((c) => ({
      id: c.credentialId,
      type: 'public-key' as const,
      transports: (c.transports as any) ?? undefined,
    }));

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email,
      userDisplayName: `${user.firstName} ${user.lastName}`.trim(),
      userID: Buffer.from(user.id, 'utf-8'),
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
    });

    const optionsId = randomUUID();
    this.setChallenge(optionsId, options.challenge, user.id);

    return { optionsId, options, deviceName };
  }

  async finishRegistration(
    user: User,
    dto: {
      optionsId: string;
      id: string;
      rawId: string;
      response: any;
      type: string;
      clientExtensionResults?: any;
      deviceName?: string;
    },
  ) {
    const entry = this.getChallenge(dto.optionsId);
    if (!entry || entry.userId !== user.id) {
      throw new BadRequestException(
        'Registration challenge expired or invalid.',
      );
    }

    const { rpID } = this.getRpConfig();
    const expectedOrigin = this.getExpectedOriginFromResponse(dto.response);

    const verification = await verifyRegistrationResponse({
      response: dto as RegistrationResponseJSON,
      expectedChallenge: entry.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Passkey registration verification failed.');
    }

    const credential = verification.registrationInfo.credential;

    const passkey = this.passkeyRepo.create({
      userId: user.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports as string[] | null,
      deviceName: dto.deviceName ?? 'Unknown Device',
    });

    await this.passkeyRepo.save(passkey);
    this.challenges.delete(dto.optionsId);

    return {
      success: true,
      credentialId: passkey.credentialId,
      deviceName: passkey.deviceName,
    };
  }

  // ─── Authentication ─────────────────────────────────────────────────────────

  async startAuthentication(dto?: { email?: string }) {
    const { rpID } = this.getRpConfig();

    let allowCredentials: { id: string; type: 'public-key'; transports?: any[] }[] = [];

    if (dto?.email) {
      const user = await this.userRepo.findOne({
        where: { email: dto.email.toLowerCase().trim() },
      });
      if (user) {
        const credentials = await this.passkeyRepo.find({
          where: { userId: user.id },
        });
        allowCredentials = credentials.map((c) => ({
          id: c.credentialId,
          type: 'public-key' as const,
          transports: (c.transports as any) ?? undefined,
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: allowCredentials.length ? allowCredentials : undefined,
      userVerification: 'required',
    });

    const optionsId = randomUUID();
    this.setChallenge(optionsId, options.challenge);

    return { optionsId, options };
  }

  async finishAuthentication(
    dto: {
      optionsId: string;
      id: string;
      rawId: string;
      response: any;
      type: string;
      clientExtensionResults?: any;
    },
    deviceLabel?: string,
    ipAddress?: string,
  ) {
    const entry = this.getChallenge(dto.optionsId);
    if (!entry) {
      throw new BadRequestException(
        'Authentication challenge expired or invalid.',
      );
    }

    const { rpID } = this.getRpConfig();
    const expectedOrigin = this.getExpectedOriginFromResponse(dto.response);

    // Look up credential by credentialId BEFORE verification
    const credentialId = dto.id;
    const passkey = await this.passkeyRepo.findOne({
      where: { credentialId },
    });
    if (!passkey) {
      throw new UnauthorizedException('Unknown credential.');
    }

    const credential = {
      id: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKey, 'base64url'),
      counter: Number(passkey.counter),
      transports: (passkey.transports as any) ?? undefined,
    };

    const verification = await verifyAuthenticationResponse({
      response: dto as AuthenticationResponseJSON,
      expectedChallenge: entry.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential,
      requireUserVerification: true,
    });

    if (!verification.verified) {
      throw new UnauthorizedException('Passkey authentication verification failed.');
    }

    // Update counter and last used
    passkey.counter = verification.authenticationInfo.newCounter;
    passkey.lastUsedAt = new Date();
    await this.passkeyRepo.save(passkey);

    this.challenges.delete(dto.optionsId);

    const user = await this.userRepo.findOne({
      where: { id: passkey.userId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    // Issue tokens (same flow as password login)
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    const tokens = await this.tokenService.generateTokens(user);
    await this.tokenService.saveRefreshToken(user.id, tokens.refreshToken);
    this.sessionService
      .createSession(user.id, deviceLabel ?? 'Unknown', ipAddress)
      .catch(() => {});

    return { ...tokens, user: this.tokenService.safeUser(user) };
  }

  // ─── Management ─────────────────────────────────────────────────────────────

  async listPasskeys(userId: string) {
    const passkeys = await this.passkeyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return passkeys.map((p) => ({
      id: p.id,
      credentialId: p.credentialId,
      deviceName: p.deviceName,
      transports: p.transports,
      createdAt: p.createdAt,
      lastUsedAt: p.lastUsedAt,
    }));
  }

  async deletePasskey(userId: string, passkeyId: string) {
    const passkey = await this.passkeyRepo.findOne({
      where: { id: passkeyId, userId },
    });
    if (!passkey) {
      throw new NotFoundException('Passkey not found.');
    }
    await this.passkeyRepo.remove(passkey);
    return { message: 'Passkey removed.' };
  }

  async renamePasskey(userId: string, passkeyId: string, deviceName: string) {
    const passkey = await this.passkeyRepo.findOne({
      where: { id: passkeyId, userId },
    });
    if (!passkey) {
      throw new NotFoundException('Passkey not found.');
    }
    passkey.deviceName = deviceName;
    await this.passkeyRepo.save(passkey);
    return { success: true, deviceName };
  }
}
