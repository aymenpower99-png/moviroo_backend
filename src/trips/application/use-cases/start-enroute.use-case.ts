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
import { DriverLocation } from '../../../dispatch/domain/entities/driver-location.entity';

@Injectable()
export class StartEnrouteUseCase {
  private readonly logger = new Logger(StartEnrouteUseCase.name);

  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(DriverLocation)
    private readonly locRepo: Repository<DriverLocation>,
  ) {}

  async execute(driverUserId: string, rideId: string): Promise<Ride> {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['vehicleClass'],
    });
    if (!ride) throw new NotFoundException('Ride not found');

    if (ride.status !== RideStatus.ASSIGNED) {
      throw new ConflictException(
        `Ride must be ASSIGNED to start en-route, current: ${ride.status}`,
      );
    }

    if (ride.driverId !== driverUserId) {
      throw new ConflictException('This ride is not assigned to you');
    }

    /* Get driver location for ETA calculation */
    const loc = await this.locRepo.findOne({ where: { driverId: driverUserId } });
    let driverEtaMin: number | null = null;

    if (loc) {
      /* Simple Haversine ETA (straight-line / 40 km/h) — can upgrade to OSRM later */
      const distKm = this.haversine(
        loc.latitude, loc.longitude,
        ride.pickupLat, ride.pickupLon,
      );
      driverEtaMin = Math.ceil((distKm / 40) * 60);
    }

    ride.status = RideStatus.EN_ROUTE_TO_PICKUP;
    ride.enrouteAt = new Date();
    await this.rideRepo.save(ride);

    this.logger.log(
      `Ride ${rideId} → EN_ROUTE_TO_PICKUP (driver ETA: ${driverEtaMin ?? '?'} min)`,
    );

    return { ...ride, driverEtaMin } as any;
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
