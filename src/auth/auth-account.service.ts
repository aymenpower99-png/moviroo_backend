import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entites/user.entity';
import { OtpService } from '../otp/otp.service';
import { AuthMailService } from '../mail/services/auth-mail.service';
import { AuthBiometricService } from './auth-passkey.service';
import { DeleteAccountDto } from './dto/security.dto';
import { UserProvider } from '../users/entites/user.entity';
import { Ride } from '../rides/domain/entities/ride.entity';
import { TripPayment } from '../billing/entities/trip-payment.entity';
import { SupportTicket } from '../support/entities/support-ticket.entity';
import { UserSession } from './entities/user-session.entity';
import { PasskeyCredential } from './entities/passkey-credential.entity';
import { UserConsent } from './entities/user-consent.entity';
import { MembershipCouponEntity } from '../passenger/entities/membership-coupon.entity';
import { AnonymizationService } from '../common/services/anonymization.service';

/**
 * Account lifecycle: GDPR deletion with mandatory re-authentication.
 *
 * Re-auth supports exactly ONE of:
 *   - password: current account password
 *   - otp:      email OTP (sent via requestDeleteOtp)
 *   - passkeyToken: action token from AuthBiometricService.verifyPasskey
 *
 * The user record is anonymized and soft-deleted (not hard-deleted) so that
 * FK references from rides, payments, etc. remain valid for accounting.
 */
@Injectable()
export class AuthAccountService {
  private readonly logger = new Logger(AuthAccountService.name);

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Ride) private rideRepo: Repository<Ride>,
    @InjectRepository(TripPayment) private paymentRepo: Repository<TripPayment>,
    @InjectRepository(SupportTicket)
    private ticketRepo: Repository<SupportTicket>,
    @InjectRepository(UserSession) private sessionRepo: Repository<UserSession>,
    @InjectRepository(PasskeyCredential)
    private passkeyRepo: Repository<PasskeyCredential>,
    @InjectRepository(UserConsent)
    private consentRepo: Repository<UserConsent>,
    @InjectRepository(MembershipCouponEntity)
    private couponRepo: Repository<MembershipCouponEntity>,
    private otpService: OtpService,
    private authMailService: AuthMailService,
    private biometricService: AuthBiometricService,
    private anonymizationService: AnonymizationService,
  ) {}

  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    // ── Google users with no security methods skip re-auth ───────────────
    const isGoogleUser = user.provider === UserProvider.GOOGLE;
    const hasSecurityMethod =
      user.is2faEnabled || user.totpEnabled || user.passkeyEnabled;
    const skipReAuth = isGoogleUser && !hasSecurityMethod;

    if (!skipReAuth) {
      const providedCount =
        (dto.password ? 1 : 0) + (dto.otp ? 1 : 0) + (dto.passkeyToken ? 1 : 0);
      if (providedCount !== 1) {
        throw new BadRequestException(
          'Provide exactly one of: password, otp, or passkeyToken.',
        );
      }

      // ── Verify re-auth ──────────────────────────────────────────────────
      if (dto.password) {
        if (!user.password) {
          throw new BadRequestException(
            'This account has no password. Please request a verification code via email or use biometric authentication.',
          );
        }
        const ok = await bcrypt.compare(dto.password, user.password);
        if (!ok) throw new UnauthorizedException('Invalid credentials');
      } else if (dto.otp) {
        await this.otpService.verifyOtp(userId, dto.otp);
      } else if (dto.passkeyToken) {
        await this.biometricService.validateActionToken(
          userId,
          dto.passkeyToken,
          'delete-account',
        );
      }
    }

    this.logger.log(`Starting GDPR deletion for user: ${userId}`);

    // ── Anonymize rides (keep for accounting, remove personal data) ────────
    const rides = await this.rideRepo.find({
      where: [{ passengerId: userId }, { driverId: userId }],
    });
    for (const ride of rides) {
      ride.pickupAddress = this.anonymizationService.anonymizeAddress(
        ride.pickupAddress,
      );
      ride.dropoffAddress = this.anonymizationService.anonymizeAddress(
        ride.dropoffAddress,
      );
      ride.cancellationReason = ride.cancellationReason
        ? this.anonymizationService.anonymizeString()
        : null;
      await this.rideRepo.save(ride);
    }
    this.logger.log(`Anonymized ${rides.length} rides for user: ${userId}`);

    // ── Anonymize payments (keep for financial records, remove personal data) ─
    const payments = await this.paymentRepo.find({
      where: [{ passengerId: userId }, { driverId: userId }],
    });
    for (const payment of payments) {
      // Payment entity doesn't have personal fields to anonymize, just keep the record
      // The ride anonymization handles the personal data
    }
    this.logger.log(
      `Kept ${payments.length} payments for accounting (user: ${userId})`,
    );

    // ── Hard delete sessions ───────────────────────────────────────────────
    await this.sessionRepo.delete({ userId });
    this.logger.log(`Deleted sessions for user: ${userId}`);

    // ── Soft delete passkeys (mark DELETED so the OS can detect stale ones) ─
    await this.passkeyRepo.update(
      { userId },
      { status: 'DELETED', deletedAt: new Date() },
    );
    this.logger.log(`Soft-deleted passkeys for user: ${userId}`);

    // ── Hard delete support tickets ───────────────────────────────────────
    await this.ticketRepo.delete({ authorId: userId });
    this.logger.log(`Deleted support tickets for user: ${userId}`);

    // ── Hard delete consents ──────────────────────────────────────────────
    await this.consentRepo.delete({ userId });
    this.logger.log(`Deleted consents for user: ${userId}`);

    // ── Hard delete membership coupons ────────────────────────────────────
    await this.couponRepo.delete({ userId });
    this.logger.log(`Deleted membership coupons for user: ${userId}`);

    // ── Anonymize user record ─────────────────────────────────────────────
    const anonymizedEmail = `deleted-${this.anonymizationService.anonymizeString()}@anonymized.local`;
    await this.userRepo.update(userId, {
      email: anonymizedEmail,
      firstName: 'Deleted',
      lastName: 'User',
      phone: null,
      avatarUrl: null,
      password: null,
      refreshToken: null,
      otpCode: null,
      otpExpiry: null,
      totpSecret: null,
      totpEnabled: false,
      is2faEnabled: false,
      primary2faMethod: null,
      passkeyEnabled: false,
      actionTokenExpiry: null,
      fcmToken: null,
      pendingEmail: null,
      emailChangeToken: null,
      emailChangeExpiry: null,
      emailVerified: false,
      isActive: false,
      status: 'pending' as any,
    });
    this.logger.log(`Anonymized user record for: ${userId}`);

    // ── Soft-delete user (keeps row for FK integrity with rides / payments) ─
    await this.userRepo.softDelete(userId);
    this.logger.log(`Soft-deleted user account: ${userId}`);

    return { message: 'Account permanently deleted.' };
  }

  /**
   * Sends an email OTP for the delete flow.
   * Always succeeds silently for security.
   */
  async requestDeleteOtp(userId: string) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    const code = await this.otpService.generateOtp(userId);
    await this.authMailService.sendOtp(
      user.email,
      user.firstName,
      code,
      'login',
    );
    return { message: 'Verification code sent to your email.' };
  }
}
