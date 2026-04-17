import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DriverLocation } from '../../domain/entities/driver-location.entity';
import { DispatchOffer } from '../../domain/entities/dispatch-offer.entity';
import { Driver } from '../../../driver/entities/driver.entity';
import { Vehicle, VehicleStatus } from '../../../vehicles/entities/vehicle.entity';

export interface EligibleDriver {
  userId: string;
  driverRecordId: string;
  vehicleId: string;
  latitude: number;
  longitude: number;
}

@Injectable()
export class FindEligibleDriversUseCase {
  private readonly logger = new Logger(FindEligibleDriversUseCase.name);

  constructor(
    @InjectRepository(DriverLocation)
    private readonly locRepo: Repository<DriverLocation>,
    @InjectRepository(DispatchOffer)
    private readonly offerRepo: Repository<DispatchOffer>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
  ) {}

  /**
   * Find drivers that are:
   *  - is_online = true AND is_on_trip = false
   *  - last_seen_at > NOW() - 60 seconds
   *  - NOT already offered for this ride_id
   *  - Vehicle class_id matches ride's class_id AND vehicle is AVAILABLE
   *  - Within maxRadiusKm of pickup
   *
   * Note: Work area assignment is informational only and is NOT used to filter
   * dispatch eligibility. GPS proximity to the pickup point is the sole
   * geographic gate (Uber-style approach).
   */
  async execute(
    rideId: string,
    classId: string,
    maxRadiusKm: number,
    pickupLat: number,
    pickupLon: number,
    pickupAddress: string,
  ): Promise<EligibleDriver[]> {
    // 1. Get drivers already offered for this ride
    const existing = await this.offerRepo.find({
      where: { rideId },
      select: ['driverId'],
    });
    const excludeIds = existing.map((o) => o.driverId);

    // 2. Find online, not-on-trip, recent driver locations
    const qb = this.locRepo
      .createQueryBuilder('dl')
      .where('dl.is_online = true')
      .andWhere('dl.is_on_trip = false')
      .andWhere("dl.last_seen_at > NOW() - INTERVAL '60 seconds'");

    if (excludeIds.length > 0) {
      qb.andWhere('dl.driver_id NOT IN (:...excludeIds)', { excludeIds });
    }

    const locations = await qb.getMany();
    this.logger.log(
      `Found ${locations.length} online drivers with recent location`,
    );

    const eligible: EligibleDriver[] = [];

    for (const loc of locations) {
      const driver = await this.driverRepo.findOne({
        where: { userId: loc.driverId },
      });
      if (!driver) continue;

      // Vehicle: class + available
      const vehicle = await this.vehicleRepo.findOne({
        where: {
          driverId: driver.id,
          classId,
          status: VehicleStatus.AVAILABLE,
        },
      });
      if (!vehicle) continue;

      // Distance check
      const dist = this.haversineKm(
        loc.latitude,
        loc.longitude,
        pickupLat,
        pickupLon,
      );
      if (dist > maxRadiusKm) continue;

      eligible.push({
        userId: loc.driverId,
        driverRecordId: driver.id,
        vehicleId: vehicle.id,
        latitude: loc.latitude,
        longitude: loc.longitude,
      });
    }

    this.logger.log(
      `${eligible.length} eligible drivers within ${maxRadiusKm}km for class ${classId} in pickup area`,
    );
    return eligible;
  }

  private haversineKm(
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

