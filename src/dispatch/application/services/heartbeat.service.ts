import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { DriverLocation } from '../../domain/entities/driver-location.entity';
import { Driver, DriverAvailabilityStatus } from '../../../driver/entities/driver.entity';

/** How often (ms) we scan for stale drivers */
const SWEEP_INTERVAL_MS = 30_000; // every 30 seconds

/** Driver considered stale if no heartbeat for this long */
const STALE_THRESHOLD_MS = 60_000; // 60 seconds

@Injectable()
export class HeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HeartbeatService.name);
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(DriverLocation)
    private readonly locRepo: Repository<DriverLocation>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
  ) {}

  onModuleInit() {
    this.sweepTimer = setInterval(() => {
      this.expireStaleDrivers().catch((err) =>
        this.logger.error('Heartbeat sweep failed', err?.stack),
      );
    }, SWEEP_INTERVAL_MS);

    this.logger.log(
      `💓 Heartbeat sweep started — every ${SWEEP_INTERVAL_MS / 1000}s, stale threshold=${STALE_THRESHOLD_MS / 1000}s`,
    );
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.logger.log('Heartbeat sweep stopped');
    }
  }

  /**
   * Mark any driver whose last_seen_at is older than STALE_THRESHOLD_MS
   * as is_online=false and sync Driver.availabilityStatus → OFFLINE.
   */
  async expireStaleDrivers(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

    const stale = await this.locRepo.find({
      where: {
        isOnline: true,
        lastSeenAt: LessThan(cutoff),
      },
      select: ['id', 'driverId'],
    });

    if (stale.length === 0) return;

    this.logger.warn(
      `⚠️  Heartbeat sweep: marking ${stale.length} stale driver(s) offline`,
    );

    for (const loc of stale) {
      // Mark location offline
      await this.locRepo.update(loc.id, { isOnline: false, isOnTrip: false });

      // Sync driver profile status
      await this.driverRepo.update(
        { userId: loc.driverId },
        { availabilityStatus: DriverAvailabilityStatus.OFFLINE },
      );

      this.logger.log(`  → Driver ${loc.driverId} forced OFFLINE (stale heartbeat)`);
    }
  }
}
