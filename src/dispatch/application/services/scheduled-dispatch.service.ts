import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';
import { Ride } from '../../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../../rides/domain/enums/ride-status.enum';
import { FallbackDispatchService } from './fallback-dispatch.service';

/** How often (ms) the scheduler scans for rides needing dispatch */
const SCAN_INTERVAL_MS = 60_000; // every 60 seconds

/** How far ahead (ms) of scheduledAt to trigger dispatch */
const DISPATCH_AHEAD_MS = 30 * 60_000; // 30 minutes before ride time

@Injectable()
export class ScheduledDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledDispatchService.name);
  private scanTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    private readonly fallbackService: FallbackDispatchService,
  ) {}

  onModuleInit() {
    this.scanTimer = setInterval(() => {
      this.scanAndDispatch().catch((err) =>
        this.logger.error('Scheduled dispatch scan failed', err?.stack),
      );
    }, SCAN_INTERVAL_MS);

    this.logger.log(
      `🕐 Scheduled dispatch started — scanning every ${SCAN_INTERVAL_MS / 1000}s, ` +
        `dispatch ${DISPATCH_AHEAD_MS / 60_000}min ahead of ride time`,
    );
  }

  onModuleDestroy() {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.logger.log('Scheduled dispatch stopped');
    }
  }

  /**
   * Find all PENDING confirmed rides whose scheduledAt is within the
   * dispatch-ahead window (now + 30 min). Transition them to SEARCHING_DRIVER
   * and trigger dispatch for each one.
   */
  async scanAndDispatch(): Promise<void> {
    const cutoff = new Date(Date.now() + DISPATCH_AHEAD_MS);

    // Confirmed future rides: PENDING + confirmedAt set + scheduledAt within window
    const rides = await this.rideRepo.find({
      where: {
        status: RideStatus.PENDING,
        confirmedAt: Not(IsNull()),
        scheduledAt: LessThanOrEqual(cutoff),
      },
      relations: ['vehicleClass'],
      order: { scheduledAt: 'ASC' },
    });

    if (rides.length === 0) return;

    this.logger.log(
      `📋 Found ${rides.length} ride(s) ready for dispatch`,
    );

    for (const ride of rides) {
      if (this.fallbackService.isDispatching(ride.id)) {
        this.logger.log(`  ⏭ Ride ${ride.id} already dispatching, skipping`);
        continue;
      }

      // Transition to SEARCHING_DRIVER now that we're actually searching
      await this.rideRepo.update(ride.id, { status: RideStatus.SEARCHING_DRIVER });
      ride.status = RideStatus.SEARCHING_DRIVER;

      this.logger.log(
        `  🚀 Auto-dispatching ride ${ride.id} (scheduledAt=${ride.scheduledAt?.toISOString()})`,
      );

      // Fire-and-forget: each dispatch runs independently
      this.fallbackService.runFullDispatch(ride).catch((err) => {
        this.logger.error(
          `Auto-dispatch failed for ride ${ride.id}`,
          err?.stack,
        );
      });
    }
  }
}
