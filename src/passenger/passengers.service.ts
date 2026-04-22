import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PassengerEntity,
  MembershipLevel,
  PaymentAddress,
} from './entities/passengers.entity';
import { UpdatePassengerDto, PaymentAddressDto, UpdateNotificationsDto } from './dto/passenger.dto';

const MEMBERSHIP_THRESHOLDS: Record<MembershipLevel, number> = {
  [MembershipLevel.GO]:    500,
  [MembershipLevel.MAX]:   2000,
  [MembershipLevel.ELITE]: 3000,
  [MembershipLevel.VIP]:   5000,
};

const MEMBERSHIP_ORDER: MembershipLevel[] = [
  MembershipLevel.GO,
  MembershipLevel.MAX,
  MembershipLevel.ELITE,
  MembershipLevel.VIP,
];

const MAX_SAVED_ADDRESSES = 5;

@Injectable()
export class PassengersService {
  constructor(
    @InjectRepository(PassengerEntity)
    private readonly passengerRepo: Repository<PassengerEntity>,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private resolveLevel(points: number): MembershipLevel {
    if (points >= MEMBERSHIP_THRESHOLDS[MembershipLevel.VIP])   return MembershipLevel.VIP;
    if (points >= MEMBERSHIP_THRESHOLDS[MembershipLevel.ELITE]) return MembershipLevel.ELITE;
    if (points >= MEMBERSHIP_THRESHOLDS[MembershipLevel.MAX])   return MembershipLevel.MAX;
    return MembershipLevel.GO;
  }

  private getLevelNumber(level: MembershipLevel): number {
    return MEMBERSHIP_ORDER.indexOf(level) + 1;  // 1, 2, 3, 4
  }

  async findByUserId(userId: string): Promise<PassengerEntity> {
    const passenger = await this.passengerRepo.findOne({
      where: { userId },
      relations: ['user'],
    });
    if (!passenger) throw new NotFoundException('Passenger profile not found');
    return passenger;
  }

  // ─── Profile ──────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<PassengerEntity> {
    return this.findByUserId(userId);
  }

  async updateProfile(userId: string, dto: UpdatePassengerDto): Promise<PassengerEntity> {
    const passenger = await this.findByUserId(userId);
    Object.assign(passenger, dto);
    return this.passengerRepo.save(passenger);
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationsDto,
  ): Promise<{ pushNotificationsEnabled: boolean; emailNotificationsEnabled: boolean }> {
    const passenger = await this.findByUserId(userId);
    if (dto.pushEnabled !== undefined) passenger.pushNotificationsEnabled = dto.pushEnabled;
    if (dto.emailEnabled !== undefined) passenger.emailNotificationsEnabled = dto.emailEnabled;
    await this.passengerRepo.save(passenger);
    return {
      pushNotificationsEnabled: passenger.pushNotificationsEnabled,
      emailNotificationsEnabled: passenger.emailNotificationsEnabled,
    };
  }

  // ─── Payment Addresses ────────────────────────────────────────────────────

  async getPaymentAddresses(userId: string): Promise<PaymentAddress[]> {
    const passenger = await this.findByUserId(userId);
    return passenger.paymentAddresses ?? [];
  }

  async addPaymentAddress(userId: string, dto: PaymentAddressDto): Promise<PassengerEntity> {
    const passenger = await this.findByUserId(userId);
    const addresses  = passenger.paymentAddresses ?? [];

    if (addresses.length >= MAX_SAVED_ADDRESSES) {
      throw new BadRequestException(`Maximum of ${MAX_SAVED_ADDRESSES} addresses reached`);
    }

    if (dto.label) {
      const exists = addresses.some(
        (a) => a.label?.toLowerCase() === dto.label!.toLowerCase(),
      );
      if (exists) throw new ConflictException(`Address with label "${dto.label}" already exists`);
    }

    passenger.paymentAddresses = [...addresses, dto];
    return this.passengerRepo.save(passenger);
  }

  async removePaymentAddress(userId: string, label: string): Promise<PassengerEntity> {
    const passenger = await this.findByUserId(userId);
    const before     = (passenger.paymentAddresses ?? []).length;

    passenger.paymentAddresses = (passenger.paymentAddresses ?? []).filter(
      (a) => a.label?.toLowerCase() !== label.toLowerCase(),
    );

    if (passenger.paymentAddresses.length === before) {
      throw new NotFoundException(`No address with label "${label}"`);
    }

    return this.passengerRepo.save(passenger);
  }

  // ─── Referral ─────────────────────────────────────────────────────────────

  async getReferralCode(userId: string): Promise<{ referralCode: string }> {
    const passenger = await this.findByUserId(userId);

    if (!passenger.referralCode) {
      passenger.referralCode = `MOV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      await this.passengerRepo.save(passenger);
    }

    return { referralCode: passenger.referralCode };
  }

  // ─── Membership ───────────────────────────────────────────────────────────

  async getMembershipInfo(userId: string) {
    const passenger    = await this.findByUserId(userId);
    const currentIdx   = MEMBERSHIP_ORDER.indexOf(passenger.membershipLevel);
    const nextLevel    = MEMBERSHIP_ORDER[currentIdx + 1] ?? null;
    const pointsToNext = nextLevel
      ? MEMBERSHIP_THRESHOLDS[nextLevel] - passenger.membershipPoints
      : null;

    return {
      levelNumber:     this.getLevelNumber(passenger.membershipLevel),
      membershipLevel: passenger.membershipLevel,
      membershipPoints:   passenger.membershipPoints,
      nextLevel,
      pointsToNext,
      thresholds:      MEMBERSHIP_THRESHOLDS,
    };
  }

  // ─── Internal (called by bookings / ratings modules) ─────────────────────

  async addPoints(userId: string, points: number): Promise<void> {
    const passenger        = await this.findByUserId(userId);
    passenger.membershipPoints   += points;
    passenger.membershipLevel  = this.resolveLevel(passenger.membershipPoints);
    await this.passengerRepo.save(passenger);
  }

  async incrementBookingCount(userId: string): Promise<void> {
    await this.passengerRepo.increment({ userId }, 'totalBookings', 1);
  }

  async updateRating(userId: string, newScore: number): Promise<void> {
    const passenger = await this.findByUserId(userId);
    const total     = passenger.totalRatings;
    const prev      = Number(passenger.ratingAverage);
    passenger.ratingAverage = parseFloat(
      ((prev * total + newScore) / (total + 1)).toFixed(2),
    );
    passenger.totalRatings += 1;
    await this.passengerRepo.save(passenger);
  }
}