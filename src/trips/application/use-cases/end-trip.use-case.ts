import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Ride } from '../../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../../rides/domain/enums/ride-status.enum';
import { TripWaypoint } from '../../domain/entities/trip-waypoint.entity';
import { DriverLocation } from '../../../dispatch/domain/entities/driver-location.entity';
import {
  Driver,
  DriverAvailabilityStatus,
} from '../../../driver/entities/driver.entity';
import { PassengerEntity } from '../../../passenger/entities/passengers.entity';
import { BillingService } from '../../../billing/services/billing.service';
import { InvoiceService } from '../../../billing/services/invoice.service';
import { CommissionTier } from '../../../billing/entities/commission-tier.entity';
import { CommissionLedger } from '../../../billing/entities/commission-ledger.entity';
import { DriverMonthlyStats } from '../../../billing/entities/driver-monthly-stats.entity';
import { DriverNotificationService } from '../../../notifications/services/driver-notification.service';
import { PassengerNotificationService } from '../../../notifications/services/passenger-notification.service';
import { MembershipLevelsService } from '../../../membership-levels/membership-levels.service';
import { Between } from 'typeorm';

@Injectable()
export class EndTripUseCase {
  private readonly logger = new Logger(EndTripUseCase.name);

  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(TripWaypoint)
    private readonly waypointRepo: Repository<TripWaypoint>,
    @InjectRepository(DriverLocation)
    private readonly locRepo: Repository<DriverLocation>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(PassengerEntity)
    private readonly passengerRepo: Repository<PassengerEntity>,
    @InjectRepository(CommissionTier)
    private readonly tierRepo: Repository<CommissionTier>,
    @InjectRepository(CommissionLedger)
    private readonly ledgerRepo: Repository<CommissionLedger>,
    @InjectRepository(DriverMonthlyStats)
    private readonly monthlyStatsRepo: Repository<DriverMonthlyStats>,
    private readonly billingService: BillingService,
    private readonly invoiceService: InvoiceService,
    private readonly driverNotif: DriverNotificationService,
    private readonly passengerNotif: PassengerNotificationService,
    private readonly membershipLevelsService: MembershipLevelsService,
  ) {}

  async execute(driverUserId: string, rideId: string): Promise<Ride> {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['vehicleClass'],
    });
    if (!ride) throw new NotFoundException('Ride not found');

    if (ride.status !== RideStatus.IN_TRIP) {
      throw new ConflictException(
        `Ride must be IN_TRIP to end, current: ${ride.status}`,
      );
    }

    if (ride.driverId !== driverUserId) {
      throw new ConflictException('This ride is not assigned to you');
    }

    const now = new Date();

    /* ── 1. Calculate real distance from waypoints ──── */
    const waypoints = await this.waypointRepo.find({
      where: { rideId },
      order: { sequence: 'ASC' },
    });

    let realDistanceKm = 0;
    for (let i = 1; i < waypoints.length; i++) {
      realDistanceKm += this.haversine(
        waypoints[i - 1].latitude,
        waypoints[i - 1].longitude,
        waypoints[i].latitude,
        waypoints[i].longitude,
      );
    }
    realDistanceKm = +realDistanceKm.toFixed(2);

    /* ── 2. Calculate real duration ──── */
    const tripStartedAt = ride.tripStartedAt ?? now;
    const realDurationMin = +(
      (now.getTime() - tripStartedAt.getTime()) /
      60000
    ).toFixed(1);

    /* ── 3. Update ride ──── */
    ride.status = RideStatus.COMPLETED;
    ride.completedAt = now;
    ride.distanceKmReal = realDistanceKm;
    ride.durationMinReal = realDurationMin;
    ride.pricingSnapshot = {
      ...ride.pricingSnapshot,
      trip_ended_at: now.toISOString(),
      real_distance_km: realDistanceKm,
      real_duration_min: realDurationMin,
      waypoint_count: waypoints.length,
    };

    await this.rideRepo.save(ride);

    /* ── 4. Free the driver — back ONLINE ──── */
    await this.locRepo.update(
      { driverId: driverUserId },
      { isOnline: true, lastSeenAt: new Date() },
    );
    await this.driverRepo.update(
      { userId: driverUserId },
      { availabilityStatus: DriverAvailabilityStatus.ONLINE },
    );

    /* ── 5. Compute per-ride commission & check tier crossing ──── */
    const driver = await this.driverRepo.findOne({
      where: { userId: driverUserId },
    });
    if (driver) {
      const now = new Date();
      const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );

      // Check if month changed - save previous month stats and reset
      if (driver.currentMonth && driver.currentMonth !== currentMonthStr) {
        // Compute previous month rides from rides table
        const [prevYear, prevMonth] = driver.currentMonth
          .split('-')
          .map(Number);
        const prevMonthStart = new Date(prevYear, prevMonth - 1, 1);
        const prevMonthEnd = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999);
        const prevMonthRides = await this.rideRepo.count({
          where: {
            driverId: driverUserId,
            status: RideStatus.COMPLETED,
            completedAt: Between(prevMonthStart, prevMonthEnd),
          },
        });

        // Save previous month stats
        const prevMonthStats = this.monthlyStatsRepo.create({
          driverId: driverUserId,
          month: driver.currentMonth,
          ridesCount: prevMonthRides,
          tierAchievedId: driver.currentTierId,
          totalEarnings: 0,
          totalCommission: 0,
        });
        await this.monthlyStatsRepo.save(prevMonthStats);

        this.logger.log(
          `📊 Saved month ${driver.currentMonth} stats for driver ${driverUserId}: ${prevMonthRides} rides`,
        );

        // Reset for new month
        driver.currentMonth = currentMonthStr;
        driver.currentTierId = null;
        driver.currentCommissionRate = 0.25;
        await this.driverRepo.save(driver);
      } else if (!driver.currentMonth) {
        // First time - initialize current month
        driver.currentMonth = currentMonthStr;
        await this.driverRepo.save(driver);
      }

      // Compute monthly rides from rides table for tier logic
      const monthlyRides = await this.rideRepo.count({
        where: {
          driverId: driverUserId,
          status: RideStatus.COMPLETED,
          completedAt: Between(monthStart, monthEnd),
        },
      });

      // Fetch active tiers sorted by required rides ascending
      const allTiers = await this.tierRepo.find({
        where: { isActive: true },
        order: { requiredRides: 'ASC' },
      });

      // Find the highest tier reached
      let newTier: CommissionTier | null = null;
      for (const tier of allTiers) {
        if (monthlyRides >= tier.requiredRides) {
          newTier = tier;
        } else {
          break;
        }
      }

      const prevTierId = driver.currentTierId;
      const newTierId = newTier?.id ?? null;
      const newRate = newTier?.commissionRate ?? 0.25;

      // Determine if tier changed
      const tierChanged = newTierId !== prevTierId;

      if (tierChanged && newTier) {
        // Update driver to new tier
        driver.currentTierId = newTier.id;
        driver.currentCommissionRate = newRate;
        await this.driverRepo.save(driver);

        this.logger.log(
          `🎉 Driver ${driverUserId} upgraded to tier ${newTier.name} (${newRate * 100}% commission) after ${monthlyRides} monthly rides`,
        );

        // Recompute commission for ALL completed rides this month with new rate
        const monthRides = await this.rideRepo.find({
          where: {
            driverId: driverUserId,
            status: RideStatus.COMPLETED,
            completedAt: Between(monthStart, monthEnd),
          },
        });

        for (const r of monthRides) {
          const price = Number(r.priceFinal) || Number(r.priceEstimate) || 0;
          const commission = +(price * newRate).toFixed(2);
          const earnings = +(price - commission).toFixed(2);
          r.commissionAmount = commission;
          r.driverEarnings = earnings;
          await this.rideRepo.save(r);
        }

        // Send tier unlock notification
        this.driverNotif
          .tierUnlocked(driverUserId, newTier.name, newRate, monthlyRides)
          .catch(() => {});
      } else {
        // No tier change — apply current rate to just this ride
        const currentRate = driver.currentCommissionRate ?? 0.25;
        const price =
          Number(ride.priceFinal) || Number(ride.priceEstimate) || 0;
        const commission = +(price * currentRate).toFixed(2);
        const earnings = +(price - commission).toFixed(2);
        ride.commissionAmount = commission;
        ride.driverEarnings = earnings;
        await this.rideRepo.save(ride);
      }

      // ── Real-time tier bonus awarding (idempotent via ledger uniqueness) ──
      // Determine current period key (YYYY-MM) — reuse computed currentMonthStr

      for (const tier of allTiers) {
        if (monthlyRides >= tier.requiredRides) {
          const exists = await this.ledgerRepo.findOne({
            where: {
              driverId: driverUserId,
              periodKey: currentMonthStr,
              tierId: tier.id,
            },
          });
          if (!exists) {
            const entry = this.ledgerRepo.create({
              driverId: driverUserId,
              periodKey: currentMonthStr,
              tierId: tier.id,
              amount: Number(tier.bonusAmount) || 0,
            });
            try {
              await this.ledgerRepo.save(entry);
              this.logger.log(
                `💰 Tier bonus awarded: driver=${driverUserId} month=${currentMonthStr} tier=${tier.name} amount=${tier.bonusAmount}`,
              );
            } catch (_) {
              // Ignore unique constraint races — idempotent by design
            }
          }
        }
      }
    }

    /* ── 6. Award loyalty points to passenger ──── */
    const pointsEarned = ride.loyaltyPointsEarned ?? 0;
    if (pointsEarned > 0) {
      // Fetch current points before update
      const passengerBefore = await this.passengerRepo.findOne({
        where: { userId: ride.passengerId },
      });
      const oldPoints = passengerBefore?.membershipPoints ?? 0;

      await this.passengerRepo
        .createQueryBuilder()
        .update(PassengerEntity)
        .set({
          membershipPoints: () => `"membership_points" + ${pointsEarned}`,
        })
        .where('user_id = :uid', { uid: ride.passengerId })
        .execute();

      this.logger.log(
        `Passenger ${ride.passengerId}: +${pointsEarned} loyalty points`,
      );

      // Check if passenger reached a new membership level
      try {
        const newTotalPoints = oldPoints + pointsEarned;
        const eligibleLevel =
          await this.membershipLevelsService.resolveEligibleLevel(newTotalPoints);
        if (eligibleLevel) {
          const oldEligibleLevel =
            await this.membershipLevelsService.resolveEligibleLevel(oldPoints);
          const oldLevelName = oldEligibleLevel?.name ?? 'Starter';
          if (eligibleLevel.name !== oldLevelName) {
            this.passengerNotif
              .membershipLevelUpgraded(
                ride.passengerId,
                eligibleLevel.name,
                `${eligibleLevel.discountPercentage}% discount`,
              )
              .catch(() => {});
            this.logger.log(
              `Passenger ${ride.passengerId} upgraded to ${eligibleLevel.name}`,
            );
          }
        }
      } catch (_) {
        // Ignore errors — notification is best-effort
      }
    }

    /* ── 7. Increment passenger totalBookings ──── */
    await this.passengerRepo
      .createQueryBuilder()
      .update(PassengerEntity)
      .set({ totalBookings: () => '"total_bookings" + 1' })
      .where('user_id = :uid', { uid: ride.passengerId })
      .execute();

    this.logger.log(
      `Ride ${rideId} → COMPLETED (real: ${realDistanceKm}km, ${realDurationMin}min, ${waypoints.length} waypoints, +${pointsEarned} pts)`,
    );

    /* ── 8. Auto-create TripPayment (CASH → PAID immediately) ──── */
    try {
      const payment = await this.billingService.createTripPayment(ride);
      // Generate invoice + email for cash rides after trip completion
      if (payment) {
        this.invoiceService.generateInvoiceIfNeeded(payment.id).catch(() => {});
      }
    } catch (err) {
      this.logger.error(
        `Failed to create TripPayment for ride ${rideId}: ${err}`,
      );
    }

    return ride;
  }

  private haversine(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
