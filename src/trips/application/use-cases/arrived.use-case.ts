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

@Injectable()
export class ArrivedUseCase {
  private readonly logger = new Logger(ArrivedUseCase.name);

  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
  ) {}

  async execute(driverUserId: string, rideId: string): Promise<Ride> {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['vehicleClass'],
    });
    if (!ride) throw new NotFoundException('Ride not found');

    if (ride.status !== RideStatus.EN_ROUTE_TO_PICKUP) {
      throw new ConflictException(
        `Ride must be EN_ROUTE_TO_PICKUP to mark arrived, current: ${ride.status}`,
      );
    }

    if (ride.driverId !== driverUserId) {
      throw new ConflictException('This ride is not assigned to you');
    }

    ride.status = RideStatus.ARRIVED;
    ride.arrivedAt = new Date();
    await this.rideRepo.save(ride);

    this.logger.log(`Ride ${rideId} → ARRIVED (waiting timer started)`);

    return ride;
  }
}
