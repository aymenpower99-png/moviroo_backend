import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ride } from '../../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../../rides/domain/enums/ride-status.enum';

export interface ScoredDriver {
  userId: string;
  driverRecordId: string;
  vehicleId: string;
  latitude: number;
  longitude: number;
  distanceToPickupKm: number;
  score: number;
}

@Injectable()
export class ScoreDriversService {
  private static readonly EARTH_RADIUS_KM = 6371;

  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
  ) {}

  /**
   * score = (1 / distance_to_pickup_km) × 0.7 + idle_time_bonus × 0.3
   * idle_time_bonus = seconds_since_last_trip / 3600, capped at 1.0
   * DO NOT use driver rating (bias risk). Sort DESC, take top 10.
   */
  async score(
    candidates: Array<{
      userId: string;
      driverRecordId: string;
      vehicleId: string;
      latitude: number;
      longitude: number;
    }>,
    pickupLat: number,
    pickupLon: number,
  ): Promise<ScoredDriver[]> {
    const scored: ScoredDriver[] = [];

    for (const c of candidates) {
      const distKm = this.haversineKm(
        c.latitude,
        c.longitude,
        pickupLat,
        pickupLon,
      );

      // Avoid division by zero for drivers right at the pickup
      const safeDist = Math.max(distKm, 0.05);

      // Find driver's last completed trip to compute idle bonus
      const lastTrip = await this.rideRepo
        .createQueryBuilder('r')
        .select('r.updatedAt', 'updatedAt')
        .where('r.driverId = :driverId', { driverId: c.userId })
        .andWhere('r.status = :status', { status: RideStatus.COMPLETED })
        .orderBy('r.updatedAt', 'DESC')
        .limit(1)
        .getRawOne<{ updatedAt: string }>();

      let idleBonus = 1.0; // max bonus if never had a trip
      if (lastTrip?.updatedAt) {
        const secsSince =
          (Date.now() - new Date(lastTrip.updatedAt).getTime()) / 1000;
        idleBonus = Math.min(secsSince / 3600, 1.0);
      }

      const s = +((1 / safeDist) * 0.7 + idleBonus * 0.3).toFixed(4);

      scored.push({
        userId: c.userId,
        driverRecordId: c.driverRecordId,
        vehicleId: c.vehicleId,
        latitude: c.latitude,
        longitude: c.longitude,
        distanceToPickupKm: +distKm.toFixed(2),
        score: s,
      });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  private haversineKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = ScoreDriversService.EARTH_RADIUS_KM;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
