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
  PaymentAddress,
} from './entities/passengers.entity';
import { UpdatePassengerDto, PaymentAddressDto, UpdateNotificationsDto } from './dto/passenger.dto';
import { MembershipLevelsService } from '../membership-levels/membership-levels.service';

const MAX_SAVED_ADDRESSES = 5;

@Injectable()
export class PassengersService {
  constructor(
    @InjectRepository(PassengerEntity)
    private readonly passengerRepo: Repository<PassengerEntity>,
    private readonly membershipLevelsService: MembershipLevelsService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async findByUserId(userId: string): Promise<PassengerEntity> {
    const passenger = await this.passengerRepo.findOne({
      where: { userId },
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
    const passenger = await this.findByUserId(userId);
    const userPoints = passenger.membershipPoints;

    // Fetch all active levels sorted by order ASC
    const levels = await this.membershipLevelsService.findAllActive();

    // Current level = highest level where user has enough points (null = starter)
    const eligibleLevels = levels.filter((l) => userPoints >= l.requiredPoints);
    const currentLevel   = eligibleLevels.length > 0
      ? eligibleLevels[eligibleLevels.length - 1]
      : null;

    // Next level = the first level the user hasn't reached yet
    const currentOrder = currentLevel?.order ?? 0;
    const nextLevel    = levels.find((l) => l.order > currentOrder) ?? null;

    // Progress toward next level
    const basePoints    = currentLevel?.requiredPoints ?? 0;
    const targetPoints  = nextLevel?.requiredPoints ?? basePoints;
    const progressPercent = nextLevel
      ? ((userPoints - basePoints) / (targetPoints - basePoints))
      : (currentLevel ? 1.0 : 0.0);

    const pointsToNext = nextLevel
      ? Math.max(0, nextLevel.requiredPoints - userPoints)
      : null;

    return {
      userPoints,
      currentLevelName: currentLevel?.name ?? 'Moviroo Starter',
      currentLevel:     currentLevel ?? null,
      nextLevel:        nextLevel ?? null,
      pointsToNext,
      progressPercent:  parseFloat(progressPercent.toFixed(4)),
      levels,
    };
  }

  // ─── Internal (called by bookings / ratings modules) ─────────────────────

  async addPoints(userId: string, points: number): Promise<void> {
    const passenger = await this.findByUserId(userId);
    passenger.membershipPoints += points;
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