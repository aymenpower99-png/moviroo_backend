import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TripWaypoint } from './domain/entities/trip-waypoint.entity';
import { RideRating } from './domain/entities/ride-rating.entity';
import { Ride } from '../rides/domain/entities/ride.entity';
import { DriverLocation } from '../dispatch/domain/entities/driver-location.entity';
import { Driver } from '../driver/entities/driver.entity';
import { PassengerEntity } from '../passenger/entities/passengers.entity';
import { TripPayment } from '../billing/entities/trip-payment.entity';
import { CommissionTier } from '../billing/entities/commission-tier.entity';
import { DriverMonthlyStats } from '../billing/entities/driver-monthly-stats.entity';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RidesModule } from '../rides/rides.module';

import { TripsController } from './trips.controller';
import { TripTrackingGateway } from './gateway/trip-tracking.gateway';

import { StartEnrouteUseCase } from './application/use-cases/start-enroute.use-case';
import { ArrivedUseCase } from './application/use-cases/arrived.use-case';
import { StartTripUseCase } from './application/use-cases/start-trip.use-case';
import { EndTripUseCase } from './application/use-cases/end-trip.use-case';
import { SubmitRatingUseCase } from './application/use-cases/submit-rating.use-case';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TripWaypoint,
      RideRating,
      Ride,
      DriverLocation,
      Driver,
      PassengerEntity,
      TripPayment,
      CommissionTier,
      DriverMonthlyStats,
    ]),
    BillingModule,
    NotificationsModule,
    RidesModule,
  ],
  controllers: [TripsController],
  providers: [
    TripTrackingGateway,
    StartEnrouteUseCase,
    ArrivedUseCase,
    StartTripUseCase,
    EndTripUseCase,
    SubmitRatingUseCase,
  ],
  exports: [TripTrackingGateway],
})
export class TripsModule {}
