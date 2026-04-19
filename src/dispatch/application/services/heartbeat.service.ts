import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { DriverLocation } from '../../domain/entities/driver-location.entity';
import { Driver, DriverAvailabilityStatus } from '../../../driver/entities/driver.entity';
import { FcmService } from '../../../notifications/fcm.service';

/** How often (ms) we scan for stale drivers */
const SWEEP_INTERVAL_MS = 30_000; // every 30 seconds

/**
 * Driver considered stale if no heartbeat for this long.
 * Flutter sends heartbeats every 20s. We allow 120s (6 missed heartbeats)
 * to absorb GPS delays, background throttling, and network jitter.
 */
const STALE_THRESHOLD_MS = 120_000; // 2 minutes

@Injectable()
export class HeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HeartbeatService.name);
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(DriverLocation)
    private readonly locRepo: Repository<DriverLocation>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    private readonly fcmService: FcmService,
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
   * Also sends FCM push notification to inform the driver.
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
      // Mark location offline + set forced flag to prevent heartbeat from re-enabling
      await this.locRepo
        .createQueryBuilder()
        .update()
        .set({ isOnline: false, isOnTrip: false, forcedOfflineAt: new Date() })
        .where('id = :id', { id: loc.id })
        .execute();

      // Sync driver profile status
      await this.driverRepo
        .createQueryBuilder()
        .update()
        .set({ availabilityStatus: DriverAvailabilityStatus.OFFLINE })
        .where('user_id = :userId', { userId: loc.driverId })
        .execute();

      // Send FCM push notification to the driver (once — sweep won't find them again
      // because isOnline is now false)
      this.fcmService.sendToUser(
        loc.driverId,
        'You went offline',
        'Your status was changed to offline due to inactivity. Open the app to go back online.',
        { type: 'DRIVER_STATUS_OFFLINE', channelId: 'driver_status' },
      ).catch((err) => {
        this.logger.warn(`FCM offline push failed for ${loc.driverId.slice(0, 8)}: ${err}`);
      });

      this.logger.log(`  → Driver ${loc.driverId} forced OFFLINE (stale heartbeat) + FCM sent`);
    }
  }
}
