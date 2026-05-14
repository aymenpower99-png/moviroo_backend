import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

/**
 * Simple anonymization service for GDPR compliance.
 * Replaces sensitive data with anonymized values.
 */
@Injectable()
export class AnonymizationService {
  /**
   * Generate a random anonymized string.
   */
  anonymizeString(): string {
    return `ANONYMIZED_${randomBytes(8).toString('hex')}`;
  }

  /**
   * Anonymize an email (preserve domain, mask local part).
   * Example: john.doe@gmail.com → jo***@gmail.com
   */
  anonymizeEmail(email: string): string {
    if (!email) return this.anonymizeString();
    const [local, domain] = email.split('@');
    if (!domain) return this.anonymizeString();
    const maskedLocal = local.substring(0, 2) + '***';
    return `${maskedLocal}@${domain}`;
  }

  /**
   * Anonymize a phone number.
   * Example: +21612345678 → ***-***-5678
   */
  anonymizePhone(phone: string): string {
    if (!phone) return this.anonymizeString();
    const lastDigits = phone.substring(phone.length - 4);
    return `***-***-${lastDigits}`;
  }

  /**
   * Anonymize an address.
   */
  anonymizeAddress(address: string): string {
    if (!address) return this.anonymizeString();
    return this.anonymizeString();
  }
}
