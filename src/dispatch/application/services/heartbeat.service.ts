import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { DriverLocation } from '../../domain/entities/driver-location.entity';
import {
  Driver,
  DriverAvailabilityStatus,
} from '../../../driver/entities/driver.entity';
import { DriverOnlineHistory } from '../../../earnings/entities/driver-online-history.entity';
import { Ride } from '../../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../../rides/domain/enums/ride-status.enum';
import { FcmService } from '../../../notifications/services/fcm.service';

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
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(DriverOnlineHistory)
    private readonly onlineHistoryRepo: Repository<DriverOnlineHistory>,
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

  // ── Helper ─────────────────────────────────────────────────────────────────

  private _currentMonth(): string {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Accumulate a validated session delta into driver_online_history for the given month.
   * Uses an atomic UPDATE with a SQL-side cap check so concurrent calls cannot
   * inflate the total beyond MAX_MONTHLY_MS (~31 days). Falls back to insert if
   * no row exists for the (driverId, month) pair.
   */
  private async _accumulateSessionTimeTx(
    repo: Repository<DriverOnlineHistory>,
    userId: string,
    month: string,
    deltaMs: number,
  ): Promise<void> {
    const MAX_MONTHLY_MS = 31 * 24 * 60 * 60 * 1000;

    const updateResult = await repo
      .createQueryBuilder()
      .update(DriverOnlineHistory)
      .set({
        onlineTimeMs: () => `"onlineTimeMs" + ${deltaMs}`,
        updatedAt: new Date(),
      })
      .where(
        '"driverId" = :driverId AND month = :month AND ("onlineTimeMs" + :deltaMs) <= :max',
        { driverId: userId, month, deltaMs, max: MAX_MONTHLY_MS },
      )
      .execute();

    if (updateResult.affected && updateResult.affected > 0) {
      return;
    }

    const existing = await repo.findOne({
      where: { driverId: userId, month },
    });

    if (existing) {
      this.logger.error(
        `[Heartbeat sweep] Driver ${userId} accumulated time would exceed monthly max ${MAX_MONTHLY_MS}ms ` +
          `(current=${existing.onlineTimeMs}ms, delta=${deltaMs}ms) — skipping accumulation.`,
      );
      return;
    }

    if (deltaMs > MAX_MONTHLY_MS) {
      this.logger.error(
        `[Heartbeat sweep] Driver ${userId} initial deltaMs ${deltaMs}ms exceeds monthly max — skipping insert.`,
      );
      return;
    }
    try {
      await repo.save({
        driverId: userId,
        month,
        onlineTimeMs: deltaMs,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (err) {
      await repo
        .createQueryBuilder()
        .update(DriverOnlineHistory)
        .set({
          onlineTimeMs: () => `"onlineTimeMs" + ${deltaMs}`,
          updatedAt: new Date(),
        })
        .where(
          '"driverId" = :driverId AND month = :month AND ("onlineTimeMs" + :deltaMs) <= :max',
          { driverId: userId, month, deltaMs, max: MAX_MONTHLY_MS },
        )
        .execute();
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
      // Check if driver has an active ride — skip forcing offline if so
      const activeRide = await this.rideRepo.findOne({
        where: {
          driverId: loc.driverId,
          status: In([
            RideStatus.ASSIGNED,
            RideStatus.EN_ROUTE_TO_PICKUP,
            RideStatus.ARRIVED,
            RideStatus.IN_TRIP,
          ]),
        },
      });

      if (activeRide) {
        this.logger.log(
          `  → Driver ${loc.driverId.slice(0, 8)} has active ride (${activeRide.status}) — skipping offline sweep`,
        );
        continue;
      }

      // Mark location offline + set forced flag to prevent heartbeat from re-enabling
      await this.locRepo
        .createQueryBuilder()
        .update()
        .set({ isOnline: false, forcedOfflineAt: new Date() })
        .where('id = :id', { id: loc.id })
        .execute();

      // Use transaction with row-level lock to atomically read onlineSince,
      // clear it, and accumulate session delta. Concurrent goOffline callers
      // block on the lock; by the time they read, onlineSince is already null.
      await this.driverRepo.manager.transaction(async (tx) => {
        const locked = await tx
          .createQueryBuilder(Driver, 'd')
          .setLock('pessimistic_write')
          .where('d.user_id = :userId', { userId: loc.driverId })
          .getOne();

        if (!locked) return;

        if (!locked.onlineSince) {
          await tx.update(
            Driver,
            { userId: loc.driverId },
            { availabilityStatus: DriverAvailabilityStatus.OFFLINE },
          );
          return;
        }

        const prevOnlineSince = locked.onlineSince;

        await tx.update(
          Driver,
          { userId: loc.driverId },
          {
            availabilityStatus: DriverAvailabilityStatus.OFFLINE,
            onlineSince: null,
          },
        );

        const deltaMs = Date.now() - new Date(prevOnlineSince).getTime();
        if (deltaMs < 0 || deltaMs > 24 * 60 * 60 * 1000) {
          this.logger.warn(
            `[Heartbeat sweep] Suspicious deltaMs for driver ${loc.driverId}: ${deltaMs}ms. Skipping accumulation.`,
          );
          return;
        }

        await this._accumulateSessionTimeTx(
          tx.getRepository(DriverOnlineHistory),
          loc.driverId,
          this._currentMonth(),
          deltaMs,
        );
      });

      // Send FCM push notification to the driver (once — sweep won't find them again
      // because isOnline is now false)
      this.fcmService
        .sendToUser(
          loc.driverId,
          'You went offline',
          'Your status was changed to offline due to inactivity. Open the app to go back online.',
          { type: 'DRIVER_STATUS_OFFLINE', channelId: 'driver_status' },
        )
        .catch((err) => {
          this.logger.warn(
            `FCM offline push failed for ${loc.driverId.slice(0, 8)}: ${err}`,
          );
        });

      this.logger.log(
        `  → Driver ${loc.driverId} forced OFFLINE (stale heartbeat) + FCM sent`,
      );
    }
  }
}
