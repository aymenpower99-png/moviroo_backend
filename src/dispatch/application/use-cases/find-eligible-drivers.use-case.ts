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
    this.logger.log(
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔍 DISPATCH ELIGIBILITY CHECK\n` +
      `   Ride:     ${rideId}\n` +
      `   Class:    ${classId}\n` +
      `   Radius:   ${maxRadiusKm} km\n` +
      `   Pickup:   [${pickupLat}, ${pickupLon}] "${pickupAddress}"\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    );

    // ── PRE-FILTER DIAGNOSTIC ─────────────────────────────────────────────────
    // Show the full state of driver_locations so we can see exactly what's blocking
    const [allLocs, onlineLocs, notOnTripLocs, recentLocs] = await Promise.all([
      this.locRepo.count(),
      this.locRepo.count({ where: { isOnline: true } }),
      this.locRepo.createQueryBuilder('dl').where('dl.is_online = true').andWhere('dl.is_on_trip = false').getCount(),
      this.locRepo.createQueryBuilder('dl').where('dl.is_online = true').andWhere('dl.is_on_trip = false').andWhere("dl.last_seen_at > NOW() - INTERVAL '120 seconds'").getCount(),
    ]);
    this.logger.log(
      `📊 driver_locations table:\n` +
      `   Total rows:              ${allLocs}\n` +
      `   is_online=true:          ${onlineLocs}\n` +
      `   online + not_on_trip:    ${notOnTripLocs}\n` +
      `   online + not_on_trip + fresh (≤120s): ${recentLocs}`,
    );

    // Also log full detail for ALL online drivers so we can see stuck states
    const allOnlineDetail = await this.locRepo.createQueryBuilder('dl').where('dl.is_online = true').getMany();
    for (const loc of allOnlineDetail) {
      const ageSeconds = Math.round((Date.now() - new Date(loc.lastSeenAt).getTime()) / 1000);
      this.logger.log(
        `   driver_locations row: driverId=${loc.driverId.slice(0, 8)} ` +
        `is_online=${loc.isOnline} is_on_trip=${loc.isOnTrip} ` +
        `last_seen=${ageSeconds}s ago lat=${loc.latitude} lon=${loc.longitude}`,
      );
    }

    // 1. Get drivers already offered for this ride
    const existing = await this.offerRepo.find({
      where: { rideId },
      select: ['driverId'],
    });
    const excludeIds = existing.map((o) => o.driverId);
    if (excludeIds.length > 0) {
      this.logger.log(`   Already offered to (excluded): ${excludeIds.map(id => id.slice(0, 8)).join(', ')}`);
    }

    // 2. Determine Work Area from pickup address (match city name in work_areas.ville)
    const allAreas = await this.workAreaRepo.find();
    const pickupLower = pickupAddress.toLowerCase();
    const matchedArea = allAreas.find((a) =>
      pickupLower.includes(a.ville.toLowerCase()),
    );
    const rideWorkAreaId = matchedArea?.id ?? null;
    if (matchedArea) {
      this.logger.log(`📍 Pickup matched Work Area: ${matchedArea.ville} (${matchedArea.id})`);
    } else {
      this.logger.log(`📍 No Work Area matched pickup "${pickupAddress}" — will use GPS-only`);
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
    this.logger.log(`✅ Location filter passed: ${locations.length} driver(s)`);

    if (locations.length === 0) {
      this.logger.warn(
        `⛔ Zero drivers passed location filter. Likely causes:\n` +
        `   • Driver never called goOnline (is_online=false)\n` +
        `   • Driver stuck is_on_trip=true from a previous trip\n` +
        `   • Heartbeat stale: last_seen_at older than 120s\n` +
        `   • forcedOfflineAt is set and heartbeat didn't re-enable online`,
      );
      return [];
    }

    // Build full candidate list with driver record + vehicle check + GPS
    const allCandidates: (EligibleDriver & { workAreaId: string | null })[] = [];

    for (const loc of locations) {
      const uid = loc.driverId.slice(0, 8);

      // ── Driver profile check ──────────────────────────────────────────────
      const driver = await this.driverRepo.findOne({
        where: { userId: loc.driverId },
      });
      if (!driver) {
        this.logger.warn(`❌ driver ${uid}: NO driver profile in drivers table for userId=${loc.driverId}`);
        continue;
      }

      // ── Vehicle check ─────────────────────────────────────────────────────
      // First, log all vehicles for this driver for full visibility
      const allVehicles = await this.vehicleRepo.find({ where: { driverId: driver.id } });
      if (allVehicles.length === 0) {
        this.logger.warn(`❌ driver ${uid} (driverId=${driver.id.slice(0, 8)}): NO vehicles assigned`);
        continue;
      }
      this.logger.log(
        `   driver ${uid} has ${allVehicles.length} vehicle(s): ` +
        allVehicles.map(v => `[classId=${v.classId.slice(0, 8)} status=${v.status}]`).join(', '),
      );
      this.logger.log(`   ride requires classId=${classId.slice(0, 8)} status=${VehicleStatus.AVAILABLE}`);

      const vehicle = allVehicles.find(
        v => v.classId === classId && v.status === VehicleStatus.AVAILABLE,
      );
      if (!vehicle) {
        // Log exactly which check failed per vehicle
        for (const v of allVehicles) {
          const classMatch = v.classId === classId;
          const statusMatch = v.status === VehicleStatus.AVAILABLE;
          if (!classMatch) {
            this.logger.warn(
              `❌ driver ${uid}: vehicle classId=${v.classId.slice(0, 8)} ≠ required ${classId.slice(0, 8)}`,
            );
          } else if (!statusMatch) {
            this.logger.warn(
              `❌ driver ${uid}: vehicle class matches but status="${v.status}" ≠ "${VehicleStatus.AVAILABLE}" — vehicle is STUCK`,
            );
          }
        }
        continue;
      }

      // ── Distance check ────────────────────────────────────────────────────
      const dist = this.haversineKm(
        loc.latitude,
        loc.longitude,
        pickupLat,
        pickupLon,
      );
      if (dist > maxRadiusKm) {
        this.logger.warn(
          `❌ driver ${uid}: distance ${dist.toFixed(2)}km > maxRadius ${maxRadiusKm}km`,
        );
        continue;
      }

      this.logger.log(
        `✅ driver ${uid}: ELIGIBLE — dist=${dist.toFixed(2)}km vehicle=${vehicle.id.slice(0, 8)}`,
      );
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

