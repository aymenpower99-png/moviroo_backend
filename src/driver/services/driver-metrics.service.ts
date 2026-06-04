import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../rides/domain/enums/ride-status.enum';
import { DispatchOffer } from '../../dispatch/domain/entities/dispatch-offer.entity';
import { OfferStatus } from '../../dispatch/domain/enums/offer-status.enum';

export interface DriverMetrics {
  totalTrips: number;
  cancellationCount: number;
  assignedRidesCount: number;
  cancellationRate: number;
  acceptedOffersCount: number;
  rejectedOffersCount: number;
  expiredOffersCount: number;
  totalOffersCount: number;
  acceptanceRate: number;
}

/**
 * Centralised metrics calculator for driver performance KPIs.
 *
 * Acceptance Rate  = accepted / (accepted + rejected + expired)
 * Cancellation Rate = driver_cancellations / assigned_rides
 *
 * Why include EXPIRED in the acceptance denominator?
 * An expired offer is a dispatch the driver did NOT accept.  Counting it
 * as a non-acceptance prevents the rate from being artificially inflated
 * to 100 % when drivers simply ignore offers.
 *
 * Why count all driver-assigned rides for cancellation denominator?
 * Any ride where a driver was assigned (COMPLETED, CANCELLED by anyone,
 * or still in progress) counts as an assigned ride.  Only driver-initiated
 * cancellations count in the numerator.
 */
@Injectable()
export class DriverMetricsService {
  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(DispatchOffer)
    private readonly offerRepo: Repository<DispatchOffer>,
  ) {}

  async computeForDriver(userId: string): Promise<DriverMetrics> {
    const [
      totalTrips,
      cancellationCount,
      assignedRidesCount,
      acceptedOffers,
      rejectedOffers,
      expiredOffers,
    ] = await Promise.all([
      this.rideRepo.count({
        where: { driverId: userId, status: RideStatus.COMPLETED },
      }),
      this.rideRepo.count({
        where: {
          driverId: userId,
          status: RideStatus.CANCELLED,
          cancelledBy: 'DRIVER',
        },
      }),
      this.rideRepo.count({
        where: { driverId: userId },
      }),
      this.offerRepo.count({
        where: { driverId: userId, status: OfferStatus.ACCEPTED },
      }),
      this.offerRepo.count({
        where: { driverId: userId, status: OfferStatus.REJECTED },
      }),
      this.offerRepo.count({
        where: { driverId: userId, status: OfferStatus.EXPIRED },
      }),
    ]);

    const totalOffers = acceptedOffers + rejectedOffers + expiredOffers;
    const acceptanceRate =
      totalOffers > 0
        ? Math.round((acceptedOffers / totalOffers) * 100)
        : 0;

    const cancellationRate =
      assignedRidesCount > 0
        ? Math.round((cancellationCount / assignedRidesCount) * 100)
        : 0;

    return {
      totalTrips,
      cancellationCount,
      assignedRidesCount,
      cancellationRate,
      acceptedOffersCount: acceptedOffers,
      rejectedOffersCount: rejectedOffers,
      expiredOffersCount: expiredOffers,
      totalOffersCount: totalOffers,
      acceptanceRate,
    };
  }
}
