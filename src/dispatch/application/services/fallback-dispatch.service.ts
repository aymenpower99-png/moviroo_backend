import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ride } from '../../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../../rides/domain/enums/ride-status.enum';
import { DispatchRideUseCase } from '../use-cases/dispatch-ride.use-case';

const DEFAULT_RADIUS_KM = 10;

@Injectable()
export class FallbackDispatchService {
  private readonly logger = new Logger(FallbackDispatchService.name);

  /** In-memory guard: prevents concurrent dispatch for the same ride */
  private readonly activeDispatches = new Set<string>();

  constructor(
    @InjectRepository(Ride) private readonly rideRepo: Repository<Ride>,
    private readonly dispatchUC: DispatchRideUseCase,
  ) {}

  /** Returns true if dispatch is already running for this ride */
  isDispatching(rideId: string): boolean {
    return this.activeDispatches.has(rideId);
  }

  /**
   * Full dispatch pipeline with 3 fallback attempts:
   *  - Attempt 1: default radius (10 km)
   *  - Attempt 2: radius +50% (15 km), surge += 0.2
   *  - Attempt 3: radius +100% (20 km), surge += 0.4
   *  - If all fail: cancel ride with reason 'no_driver_found'
   */
  async runFullDispatch(ride: Ride): Promise<void> {
    // Dedup guard: prevent concurrent dispatch for the same ride
    if (this.activeDispatches.has(ride.id)) {
      this.logger.warn(`⚠️ Dispatch already running for ride ${ride.id}, skipping`);
      return;
    }
    this.activeDispatches.add(ride.id);

    try {
      await this._dispatchPipeline(ride);
    } finally {
      this.activeDispatches.delete(ride.id);
    }
  }

  private async _dispatchPipeline(ride: Ride): Promise<void> {
    const allOffers: any[] = [];

    const attempts = [
      { radiusKm: DEFAULT_RADIUS_KM, surgeAdd: 0 },
      { radiusKm: DEFAULT_RADIUS_KM * 1.5, surgeAdd: 0.2 },
      { radiusKm: DEFAULT_RADIUS_KM * 2, surgeAdd: 0.4 },
    ];

    for (let i = 0; i < attempts.length; i++) {
      const { radiusKm, surgeAdd } = attempts[i];
      this.logger.log(
        `📡 Dispatch attempt ${i + 1}/3 — radius=${radiusKm}km surgeAdd=${surgeAdd}`,
      );

      const result = await this.dispatchUC.execute(ride, radiusKm);
      allOffers.push(...result.offersLog);

      if (result.assigned) {
        const snap: Record<string, any> = {
          attempts: i + 1,
          totalOffers: allOffers.length,
          offers: allOffers,
          result: 'ASSIGNED',
        };
        await this.rideRepo.update(ride.id, { dispatchSnapshot: snap as any });
        this.logger.log(
          `✅ Dispatch succeeded on attempt ${i + 1} for ride ${ride.id}`,
        );
        return;
      }

      // Re-check ride status (might have been cancelled)
      const fresh = await this.rideRepo.findOne({
        where: { id: ride.id },
      });
      if (!fresh || fresh.status !== RideStatus.SEARCHING_DRIVER) {
        this.logger.log(
          `Ride ${ride.id} no longer searching (status=${fresh?.status}), aborting dispatch`,
        );
        return;
      }

      // Apply surge increase metadata for next attempt
      if (surgeAdd > 0 && fresh.surgeMultiplier != null) {
        await this.rideRepo.update(ride.id, {
          surgeMultiplier: +(fresh.surgeMultiplier + surgeAdd).toFixed(2),
        });
      }
    }

    // All attempts exhausted → cancel ride
    this.logger.warn(
      `🚫 All dispatch attempts failed for ride ${ride.id}, cancelling`,
    );
    const failSnap: Record<string, any> = {
      attempts: 3,
      totalOffers: allOffers.length,
      offers: allOffers,
      result: 'NO_DRIVER_FOUND',
    };
    await this.rideRepo.update(ride.id, {
      status: RideStatus.CANCELLED,
      cancelledAt: new Date(),
      cancellationReason: 'No drivers available after 3 dispatch attempts',
      dispatchSnapshot: failSnap as any,
    });
  }
}
