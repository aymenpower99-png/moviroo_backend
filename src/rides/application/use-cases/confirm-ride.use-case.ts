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

    /* Lock price and transition — keep billing price (finalPrice), fallback to estimate */
    ride.priceFinal = ride.priceFinal ?? ride.priceEstimate;
    ride.status = RideStatus.SEARCHING_DRIVER;
    ride.confirmedAt = new Date();

    await this.rideRepo.save(ride);

    /* ── Auto-dispatch logic ──────────────────────────── */
    const now = Date.now();
    const rideTime = ride.scheduledAt ? new Date(ride.scheduledAt).getTime() : now;
    const isImmediate = (rideTime - now) <= IMMEDIATE_THRESHOLD_MS;

    if (isImmediate) {
      this.logger.log(
        `⚡ Ride ${ride.id} is immediate (scheduledAt within ${IMMEDIATE_THRESHOLD_MS / 60_000}min) — starting dispatch now`,
      );
      // Fire-and-forget: dispatch runs in background
      this.fallbackService.runFullDispatch(ride).catch((err) => {
        this.logger.error(`Auto-dispatch failed for ride ${ride.id}`, err?.stack);
      });
    } else {
      this.logger.log(
        `🕐 Ride ${ride.id} is scheduled for ${ride.scheduledAt?.toISOString()} — scheduler will handle dispatch`,
      );
    }

    return ride;
  }
}
