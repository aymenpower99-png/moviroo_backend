import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Ride } from '../../domain/entities/ride.entity';
import { RideStatus } from '../../domain/enums/ride-status.enum';
import { User, UserRole } from '../../../users/entites/user.entity';
import { FallbackDispatchService } from '../../../dispatch/application/services/fallback-dispatch.service';

/** Rides within this window (ms) are considered "immediate" and dispatched right away */
const IMMEDIATE_THRESHOLD_MS = 60 * 60_000; // 60 minutes

@Injectable()
export class ConfirmRideUseCase {
  private readonly logger = new Logger(ConfirmRideUseCase.name);

  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    private readonly fallbackService: FallbackDispatchService,
  ) {}

  async execute(currentUser: User, rideId: string): Promise<Ride> {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['vehicleClass'],
    });
    if (!ride) throw new NotFoundException('Ride not found');

    /* Authorization */
    if (
      currentUser.role !== UserRole.SUPER_ADMIN &&
      ride.passengerId !== currentUser.id
    ) {
      throw new ForbiddenException('You can only confirm your own rides');
    }

    if (ride.status !== RideStatus.PENDING) {
      throw new ConflictException(
        `Cannot confirm a ride in ${ride.status} status`,
      );
    }

    // Prevent double-confirmation
    if (ride.confirmedAt) {
      throw new ConflictException('Ride is already confirmed');
    }

    /* Lock price */
    ride.priceFinal = ride.priceFinal ?? ride.priceEstimate;
    ride.confirmedAt = new Date();

    /* ── Decide: immediate dispatch or wait for scheduler ── */
    const now = Date.now();
    const rideTime = ride.scheduledAt ? new Date(ride.scheduledAt).getTime() : now;
    const isImmediate = (rideTime - now) <= IMMEDIATE_THRESHOLD_MS;

    if (isImmediate) {
      // Trip is within 60 min — search for driver immediately
      ride.status = RideStatus.SEARCHING_DRIVER;
      await this.rideRepo.save(ride);

      this.logger.log(
        `⚡ Ride ${ride.id} is immediate (within ${IMMEDIATE_THRESHOLD_MS / 60_000}min) — dispatching now`,
      );
      this.fallbackService.runFullDispatch(ride).catch((err) => {
        this.logger.error(`Auto-dispatch failed for ride ${ride.id}`, err?.stack);
      });
    } else {
      // Future trip — keep PENDING so status is meaningful.
      // ScheduledDispatchService will transition to SEARCHING_DRIVER 30 min before.
      ride.status = RideStatus.PENDING;
      await this.rideRepo.save(ride);

      this.logger.log(
        `🕐 Ride ${ride.id} confirmed for ${ride.scheduledAt?.toISOString()} — scheduler will dispatch 30min before`,
      );
    }

    return ride;
  }
}
