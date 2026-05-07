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

  /** Record a new login session. */
  async createSession(
    userId: string,
    deviceLabel: string,
    ipAddress?: string,
  ): Promise<UserSession> {
    const session = this.sessionRepo.create({
      userId,
      deviceLabel: deviceLabel || 'Unknown',
      ipAddress: ipAddress ?? null,
      lastSeenAt: new Date(),
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
