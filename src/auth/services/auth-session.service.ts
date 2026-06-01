import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSession } from '../entities/user-session.entity';
import { User } from '../../users/entites/user.entity';

@Injectable()
export class AuthSessionService {
  constructor(
    @InjectRepository(UserSession)
    private readonly sessionRepo: Repository<UserSession>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Record or update a login session.
   * If a session with the same (userId, deviceId) exists, update lastSeenAt
   * and ipAddress instead of creating a duplicate row.
   */
  async upsertSession(
    userId: string,
    deviceLabel: string,
    ipAddress?: string,
    deviceId?: string,
    platform?: string,
    userAgent?: string,
  ): Promise<UserSession> {
    const label = deviceLabel?.trim() || 'Unknown';
    const now = new Date();

    // If we have a stable deviceId, try to update existing session
    if (deviceId) {
      const existing = await this.sessionRepo.findOne({
        where: { userId, deviceId },
      });
      if (existing) {
        existing.lastSeenAt = now;
        if (ipAddress) existing.ipAddress = ipAddress;
        if (label !== 'Unknown') existing.deviceLabel = label;
        if (platform) existing.platform = platform;
        if (userAgent) existing.userAgent = userAgent;
        return this.sessionRepo.save(existing);
      }
    }

    // No existing session found — create new
    const session = this.sessionRepo.create({
      userId,
      deviceLabel: label,
      deviceId: deviceId ?? null,
      platform: platform ?? null,
      userAgent: userAgent ?? null,
      ipAddress: ipAddress ?? null,
      lastSeenAt: now,
    });
    return this.sessionRepo.save(session);
  }

  /** Returns the last 10 sessions for a user, newest first. */
  getSessions(userId: string): Promise<UserSession[]> {
    return this.sessionRepo.find({
      where: { userId },
      order: { lastSeenAt: 'DESC' },
      take: 10,
    });
  }

  /**
   * Signs out all devices:
   *   1. Clears User.refreshToken → all refresh tokens stop working immediately.
   *   2. Deletes all session records for the user.
   */
  async revokeAllSessions(userId: string): Promise<{ message: string }> {
    await this.userRepo.update(userId, { refreshToken: null });
    await this.sessionRepo.delete({ userId });
    return {
      message: 'All sessions revoked. You have been signed out of all devices.',
    };
  }

  /** Remove a single session record (audit cleanup). */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    await this.sessionRepo.delete({ id: sessionId, userId });
  }

  /** Called on normal logout — remove all sessions and clear the refresh token. */
  async clearSessions(userId: string): Promise<void> {
    await this.sessionRepo.delete({ userId });
  }
}
