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
import { Driver, DriverAvailabilityStatus } from '../../../driver/entities/driver.entity';
import { PassengerEntity } from '../../../passenger/entities/passengers.entity';

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
    const realDurationMin = +((now.getTime() - tripStartedAt.getTime()) / 60000).toFixed(1);

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
      { isOnTrip: false, isOnline: true, lastSeenAt: new Date() },
    );
    await this.driverRepo.update(
      { userId: driverUserId },
      { availabilityStatus: DriverAvailabilityStatus.ONLINE },
    );

    /* ── 5. Increment driver totalTrips ──── */
    await this.driverRepo
      .createQueryBuilder()
      .update(Driver)
      .set({ totalTrips: () => '"total_trips" + 1' })
      .where('user_id = :uid', { uid: driverUserId })
      .execute();

    /* ── 6. Award loyalty points to passenger ──── */
    const pointsEarned = ride.loyaltyPointsEarned ?? 0;
    if (pointsEarned > 0) {
      await this.passengerRepo
        .createQueryBuilder()
        .update(PassengerEntity)
        .set({ membershipPoints: () => `"membership_points" + ${pointsEarned}` })
        .where('user_id = :uid', { uid: ride.passengerId })
        .execute();

      this.logger.log(`Passenger ${ride.passengerId}: +${pointsEarned} loyalty points`);
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

    return ride;
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
