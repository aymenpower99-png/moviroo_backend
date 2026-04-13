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
export class StartTripUseCase {
  private readonly logger = new Logger(StartTripUseCase.name);

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

    if (ride.status !== RideStatus.ARRIVED) {
      throw new ConflictException(
        `Ride must be ARRIVED to start trip, current: ${ride.status}`,
      );
    }

    if (ride.driverId !== driverUserId) {
      throw new ConflictException('This ride is not assigned to you');
    }

    const now = new Date();

    /* ── Extra waiting fee calculation ────────── */
    const freeWaitingMin = ride.vehicleClass?.freeWaitingTime ?? 5;
    const arrivedAt = ride.arrivedAt ?? now;
    const waitedSec = (now.getTime() - arrivedAt.getTime()) / 1000;
    const freeWaitingSec = freeWaitingMin * 60;

    let extraWaitingFee = 0;
    if (waitedSec > freeWaitingSec) {
      const extraMin = (waitedSec - freeWaitingSec) / 60;
      const WAITING_RATE_PER_MIN = 0.5; // TND per extra minute
      extraWaitingFee = Math.ceil(extraMin * WAITING_RATE_PER_MIN);
    }

    if (extraWaitingFee > 0 && ride.priceFinal != null) {
      ride.priceFinal = +(ride.priceFinal + extraWaitingFee).toFixed(2);
      this.logger.log(
        `Ride ${rideId}: extra waiting fee +${extraWaitingFee} TND (waited ${Math.round(waitedSec)}s, free=${freeWaitingSec}s)`,
      );
    }

    ride.status = RideStatus.IN_TRIP;
    ride.tripStartedAt = now;

    /* Store waiting info in pricing snapshot */
    ride.pricingSnapshot = {
      ...ride.pricingSnapshot,
      trip_started_at: now.toISOString(),
      waited_seconds: Math.round(waitedSec),
      free_waiting_seconds: freeWaitingSec,
      extra_waiting_fee: extraWaitingFee,
    };

    await this.rideRepo.save(ride);

    this.logger.log(
      `Ride ${rideId} → IN_TRIP (waited ${Math.round(waitedSec)}s, extra fee: ${extraWaitingFee} TND)`,
    );

    return ride;
  }
}
