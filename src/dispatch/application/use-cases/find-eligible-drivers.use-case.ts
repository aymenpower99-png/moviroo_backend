import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DriverLocation } from '../../domain/entities/driver-location.entity';
import { DispatchOffer } from '../../domain/entities/dispatch-offer.entity';
import { Driver } from '../../../driver/entities/driver.entity';
import { Vehicle, VehicleStatus } from '../../../vehicles/entities/vehicle.entity';
import { WorkArea } from '../../../work-area/entities/work-area.entity';

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
    @InjectRepository(WorkArea)
    private readonly workAreaRepo: Repository<WorkArea>,
  ) {}

  /**
   * Hybrid dispatch: Work Area first → GPS fallback
   *
   * STEP 1: Find drivers in the same Work Area as the pickup
   * STEP 2: Filter by GPS within maxRadiusKm
   * STEP 3: If no drivers found in Work Area, fallback to GPS-only (global)
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

    // 2. Determine Work Area from pickup address (match city name in work_areas.ville)
    const allAreas = await this.workAreaRepo.find();
    const pickupLower = pickupAddress.toLowerCase();
    const matchedArea = allAreas.find((a) =>
      pickupLower.includes(a.ville.toLowerCase()),
    );
    const rideWorkAreaId = matchedArea?.id ?? null;
    if (matchedArea) {
      this.logger.log(`Pickup "${pickupAddress}" matched Work Area: ${matchedArea.ville} (${matchedArea.id})`);
    }

    // 3. Find online, not-on-trip, recent driver locations
    const qb = this.locRepo
      .createQueryBuilder('dl')
      .where('dl.is_online = true')
      .andWhere('dl.is_on_trip = false')
      .andWhere("dl.last_seen_at > NOW() - INTERVAL '120 seconds'");

    if (excludeIds.length > 0) {
      qb.andWhere('dl.driver_id NOT IN (:...excludeIds)', { excludeIds });
    }

    const locations = await qb.getMany();
    this.logger.log(
      `Found ${locations.length} online drivers with recent location`,
    );

    // Build full candidate list with driver record + vehicle check + GPS
    const allCandidates: (EligibleDriver & { workAreaId: string | null })[] = [];

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

      allCandidates.push({
        userId: loc.driverId,
        driverRecordId: driver.id,
        vehicleId: vehicle.id,
        latitude: loc.latitude,
        longitude: loc.longitude,
        workAreaId: driver.workAreaId,
      });
    }

    // STEP 1: Try drivers in same Work Area first
    if (rideWorkAreaId) {
      const inArea = allCandidates.filter(
        (c) => c.workAreaId === rideWorkAreaId,
      );
      if (inArea.length > 0) {
        this.logger.log(
          `${inArea.length} eligible drivers in Work Area ${rideWorkAreaId} within ${maxRadiusKm}km`,
        );
        return inArea;
      }
      this.logger.log(
        `No drivers in Work Area ${rideWorkAreaId} — falling back to global GPS`,
      );
    }

    // STEP 2: Fallback — all GPS-eligible regardless of Work Area
    this.logger.log(
      `${allCandidates.length} eligible drivers (global GPS) within ${maxRadiusKm}km for class ${classId}`,
    );
    return allCandidates;
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

