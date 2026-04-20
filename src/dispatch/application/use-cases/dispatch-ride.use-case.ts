import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ride } from '../../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../../rides/domain/enums/ride-status.enum';
import { DispatchOffer } from '../../domain/entities/dispatch-offer.entity';
import { OfferStatus } from '../../domain/enums/offer-status.enum';
import { FindEligibleDriversUseCase } from './find-eligible-drivers.use-case';
import {
  ScoreDriversService,
  ScoredDriver,
} from '../services/score-drivers.service';
import { FcmService } from '../../../notifications/services/fcm.service';

/** Configurable offer timeout (default 45 seconds — gives driver time to see & respond) */
const OFFER_TIMEOUT_MS = parseInt(
  process.env.DISPATCH_OFFER_TIMEOUT_MS ?? '45000',
  10,
);

@Injectable()
export class DispatchRideUseCase {
  private readonly logger = new Logger(DispatchRideUseCase.name);

  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(DispatchOffer)
    private readonly offerRepo: Repository<DispatchOffer>,
    private readonly findDrivers: FindEligibleDriversUseCase,
    private readonly scoreService: ScoreDriversService,
    private readonly fcmService: FcmService,
  ) {}

  /**
   * Sequential dispatch loop:
   *  1. Find eligible drivers → score them
   *  2. For each (sorted by score DESC, top 10):
   *     a. Insert dispatch_offer (PENDING, expires_at = now + 15s)
   *     b. Wait 15 seconds
   *     c. If ACCEPTED → done; if still PENDING → mark EXPIRED; continue
   */
  async execute(
    ride: Ride,
    maxRadiusKm = 10,
  ): Promise<{ assigned: boolean; offersLog: any[] }> {
    this.logger.log(
      `🚀 Dispatch started for ride ${ride.id} (radius=${maxRadiusKm}km)`,
    );

    const eligible = await this.findDrivers.execute(
      ride.id,
      ride.classId,
      maxRadiusKm,
      ride.pickupLat,
      ride.pickupLon,
      ride.pickupAddress,
    );

    if (eligible.length === 0) {
      this.logger.warn(`No eligible drivers for ride ${ride.id}`);
      return { assigned: false, offersLog: [] };
    }

    const scored: ScoredDriver[] = await this.scoreService.score(
      eligible,
      ride.pickupLat,
      ride.pickupLon,
    );

    this.logger.log(
      `Scored ${scored.length} drivers: ${scored.map((s) => `${s.userId.slice(0, 8)}(${s.score})`).join(', ')}`,
    );

    const offersLog: any[] = [];

    for (const candidate of scored) {
      // Check ride still needs a driver
      const currentRide = await this.rideRepo.findOne({
        where: { id: ride.id },
      });
      if (!currentRide || currentRide.status !== RideStatus.SEARCHING_DRIVER) {
        this.logger.log(
          `Ride ${ride.id} no longer SEARCHING_DRIVER (status=${currentRide?.status})`,
        );
        break;
      }

      // Create offer
      const now = new Date();
      const offer = this.offerRepo.create({
        rideId: ride.id,
        driverId: candidate.userId,
        offeredAt: now,
        expiresAt: new Date(now.getTime() + OFFER_TIMEOUT_MS),
        status: OfferStatus.PENDING,
        distanceToPickupKm: candidate.distanceToPickupKm,
        score: candidate.score,
      });
      await this.offerRepo.save(offer);

      // Push notification to driver's device
      this.fcmService
        .sendRideOffer(
          candidate.userId,
          offer.id,
          ride.pickupAddress,
          ride.dropoffAddress,
          ride.priceFinal ?? ride.priceEstimate ?? 0,
          ride.distanceKm ?? 0,
        )
        .catch((e) =>
          this.logger.warn(
            `FCM push failed for driver ${candidate.userId.slice(0, 8)}: ${e.message}`,
          ),
        );

      this.logger.log(
        `📨 Offer ${offer.id} → driver ${candidate.userId.slice(0, 8)} ` +
          `(score=${candidate.score}, dist=${candidate.distanceToPickupKm}km, ` +
          `timeout=${OFFER_TIMEOUT_MS}ms)`,
      );

      // Wait for the timeout period
      await new Promise((resolve) => setTimeout(resolve, OFFER_TIMEOUT_MS));

      // Re-fetch offer to check if driver responded
      const refreshed = await this.offerRepo.findOne({
        where: { id: offer.id },
      });
      if (!refreshed) continue;

      if (refreshed.status === OfferStatus.ACCEPTED) {
        this.logger.log(
          `✅ Driver ${candidate.userId.slice(0, 8)} ACCEPTED ride ${ride.id}`,
        );
        offersLog.push({
          driverId: candidate.userId,
          status: 'ACCEPTED',
          score: candidate.score,
          distKm: candidate.distanceToPickupKm,
        });
        return { assigned: true, offersLog };
      }

      // Expire if still PENDING (atomic update prevents race with accept)
      if (refreshed.status === OfferStatus.PENDING) {
        await this.offerRepo.update(
          { id: offer.id, status: OfferStatus.PENDING },
          { status: OfferStatus.EXPIRED },
        );
        this.logger.log(
          `⏳ Offer ${offer.id} EXPIRED for driver ${candidate.userId.slice(0, 8)}`,
        );
        offersLog.push({
          driverId: candidate.userId,
          status: 'EXPIRED',
          score: candidate.score,
          distKm: candidate.distanceToPickupKm,
        });
      } else {
        // REJECTED
        this.logger.log(
          `❌ Offer ${offer.id} REJECTED by driver ${candidate.userId.slice(0, 8)}`,
        );
        offersLog.push({
          driverId: candidate.userId,
          status: refreshed.status,
          score: candidate.score,
          distKm: candidate.distanceToPickupKm,
        });
      }
    }

    this.logger.log(`All drivers exhausted for ride ${ride.id}`);
    return { assigned: false, offersLog };
  }
}
