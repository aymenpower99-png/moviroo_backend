import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserConsent, ConsentType } from '../entities/user-consent.entity';

/**
 * Simple consent tracking service for GDPR compliance.
 * Stores user consent for data processing.
 */
@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(
    @InjectRepository(UserConsent)
    private consentRepo: Repository<UserConsent>,
  ) {}

  /**
   * Record user consent.
   */
  async recordConsent(
    userId: string,
    consentType: ConsentType,
    granted: boolean,
  ): Promise<UserConsent> {
    const consent = this.consentRepo.create({
      userId,
      consentType,
      granted,
    });
    const saved = await this.consentRepo.save(consent);
    this.logger.log(
      `Consent recorded for user ${userId}: ${consentType} = ${granted}`,
    );
    return saved;
  }

  /**
   * Record multiple consents at once (e.g., during registration).
   */
  async recordConsents(
    userId: string,
    consents: { consentType: ConsentType; granted: boolean }[],
  ): Promise<void> {
    for (const consent of consents) {
      await this.recordConsent(userId, consent.consentType, consent.granted);
    }
  }

  /**
   * Get user's consent for a specific type.
   */
  async getConsent(
    userId: string,
    consentType: ConsentType,
  ): Promise<UserConsent | null> {
    return this.consentRepo.findOne({
      where: { userId, consentType },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get all user consents.
   */
  async getUserConsents(userId: string): Promise<UserConsent[]> {
    return this.consentRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Update user consent.
   */
  async updateConsent(
    userId: string,
    consentType: ConsentType,
    granted: boolean,
  ): Promise<UserConsent> {
    const consent = this.consentRepo.create({
      userId,
      consentType,
      granted,
    });
    const saved = await this.consentRepo.save(consent);
    this.logger.log(
      `Consent updated for user ${userId}: ${consentType} = ${granted}`,
    );
    return saved;
  }
}
