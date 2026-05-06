import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PassengerEntity } from './entities/passengers.entity';
import {
  UpdatePassengerDto,
  UpdateNotificationsDto,
} from './dto/passenger.dto';
import { MembershipLevelsService } from '../membership-levels/membership-levels.service';
import {
  MembershipCouponEntity,
  CouponStatus,
} from './entities/membership-coupon.entity';
import { User } from '../users/entites/user.entity';

@Injectable()
export class PassengersService {
  constructor(
    @InjectRepository(PassengerEntity)
    private readonly passengerRepo: Repository<PassengerEntity>,
    @InjectRepository(MembershipCouponEntity)
    private readonly couponRepo: Repository<MembershipCouponEntity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
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

  async updateProfile(
    userId: string,
    dto: UpdatePassengerDto,
  ): Promise<PassengerEntity> {
    const passenger = await this.findByUserId(userId);
    Object.assign(passenger, dto);
    return this.passengerRepo.save(passenger);
  }

  async getNotificationPreferences(userId: string): Promise<{
    pushNotificationsEnabled: boolean;
    emailNotificationsEnabled: boolean;
  }> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      pushNotificationsEnabled: user.pushNotificationsEnabled,
      emailNotificationsEnabled: user.emailNotificationsEnabled,
    };
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationsDto,
  ): Promise<{
    pushNotificationsEnabled: boolean;
    emailNotificationsEnabled: boolean;
  }> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    if (dto.pushEnabled !== undefined)
      user.pushNotificationsEnabled = dto.pushEnabled;
    if (dto.emailEnabled !== undefined)
      user.emailNotificationsEnabled = dto.emailEnabled;
    await this.userRepo.save(user);

    return {
      pushNotificationsEnabled: user.pushNotificationsEnabled,
      emailNotificationsEnabled: user.emailNotificationsEnabled,
    };
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

    // Displayed balance — total points earned by the passenger
    const userPoints = passenger.membershipPoints;

    // Fetch all active levels sorted by level ASC
    const levels = await this.membershipLevelsService.findAllActive();

    // ── Current level: claim-based (highest level the user has ever claimed) ─
    const claimedCoupons = await this.couponRepo.find({
      where: { userId: passenger.userId },
      order: { level: 'DESC' },
    });

    const highestClaimedLevelNum =
      claimedCoupons.length > 0 ? claimedCoupons[0].level : 0;
    const currentLevel =
      levels.find((l) => l.level === highestClaimedLevelNum) ?? null;

    // Level IDs that still have an ACTIVE coupon (not yet used)
    const activeCoupons = claimedCoupons.filter(
      (c) => c.status === CouponStatus.ACTIVE,
    );
    const claimedLevelIds = activeCoupons.map((c) => c.levelId);

    // Map of levelId → coupon code for active coupons (so Flutter can restore codes after page refresh)
    const activeCouponCodes: Record<string, string> = {};
    activeCoupons.forEach((c) => {
      activeCouponCodes[c.levelId] = c.code;
    });

    // Next level = the first level above the current claimed level
    const currentLevelNum = currentLevel?.level ?? 0;
    const nextLevel = levels.find((l) => l.level > currentLevelNum) ?? null;

    // Progress toward next level (based on remaining/spendable points)
    const basePoints = currentLevel?.requiredPoints ?? 0;
    const targetPoints = nextLevel?.requiredPoints ?? basePoints;
    const progressPercent = nextLevel
      ? Math.max(
          0,
          Math.min(1, (userPoints - basePoints) / (targetPoints - basePoints)),
        )
      : currentLevel
        ? 1.0
        : 0.0;

    const pointsToNext = nextLevel
      ? Math.max(0, nextLevel.requiredPoints - userPoints)
      : null;

    return {
      userPoints,
      remainingPoints: passenger.membershipPoints,
      totalPoints: passenger.membershipPoints,
      currentLevelName: currentLevel?.name ?? 'Moviroo Starter',
      currentLevel: currentLevel ?? null,
      nextLevel: nextLevel ?? null,
      pointsToNext,
      progressPercent: parseFloat(progressPercent.toFixed(4)),
      levels,
      claimedLevelIds,
      activeCouponCodes,
    };
  }

  // ─── Internal (called by bookings / ratings modules) ─────────────────────

  async addPoints(userId: string, points: number): Promise<void> {
    const passenger = await this.findByUserId(userId);
    passenger.membershipPoints += points;
    passenger.remainingPoints += points;
    await this.passengerRepo.save(passenger);
  }

  async incrementBookingCount(userId: string): Promise<void> {
    await this.passengerRepo.increment({ userId }, 'totalBookings', 1);
  }

  async updateRating(userId: string, newScore: number): Promise<void> {
    const passenger = await this.findByUserId(userId);
    const total = passenger.totalRatings;
    const prev = Number(passenger.ratingAverage);
    passenger.ratingAverage = parseFloat(
      ((prev * total + newScore) / (total + 1)).toFixed(2),
    );
    passenger.totalRatings += 1;
    await this.passengerRepo.save(passenger);
  }

  // ─── Coupons ──────────────────────────────────────────────────────────────

  async claimLevelCoupon(
    userId: string,
    levelId: string,
  ): Promise<MembershipCouponEntity> {
    const passenger = await this.findByUserId(userId);
    const level = await this.membershipLevelsService.claimLevel(
      levelId,
      passenger.membershipPoints,
    );

    // Deduct required points from membership balance
    passenger.membershipPoints -= level.requiredPoints;
    passenger.remainingPoints -= level.requiredPoints;
    await this.passengerRepo.save(passenger);

    // Generate a unique coupon code
    const prefix = level.name
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .join('');
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const code = `MOV-${prefix}-${suffix}`;

    const coupon = this.couponRepo.create({
      userId: passenger.userId,
      levelId: level.id,
      level: level.level,
      code,
      discountPercentage: level.discountPercentage,
      status: CouponStatus.ACTIVE,
    });

    return this.couponRepo.save(coupon);
  }

  async validateCoupon(
    userId: string,
    code: string,
  ): Promise<{ code: string; discountPercentage: number; level: number }> {
    const coupon = await this.couponRepo.findOne({
      where: { code: code.toUpperCase(), userId, status: CouponStatus.ACTIVE },
    });

    if (!coupon) {
      throw new BadRequestException('Invalid or already used coupon code.');
    }

    return {
      code: coupon.code,
      discountPercentage: coupon.discountPercentage,
      level: coupon.level,
    };
  }

  async useCoupon(userId: string, code: string): Promise<void> {
    const coupon = await this.couponRepo.findOne({
      where: { code: code.toUpperCase(), userId, status: CouponStatus.ACTIVE },
    });

    if (!coupon) {
      throw new BadRequestException('Invalid or already used coupon code.');
    }

    coupon.status = CouponStatus.USED;
    coupon.usedAt = new Date();
    await this.couponRepo.save(coupon);
  }

  async getUserCoupons(userId: string): Promise<MembershipCouponEntity[]> {
    return this.couponRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }
}
