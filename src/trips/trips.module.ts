import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TripWaypoint } from './domain/entities/trip-waypoint.entity';
import { RideRating } from './domain/entities/ride-rating.entity';
import { Ride } from '../rides/domain/entities/ride.entity';
import { DriverLocation } from '../dispatch/domain/entities/driver-location.entity';
import { Driver } from '../driver/entities/driver.entity';
import { PassengerEntity } from '../passenger/entities/passengers.entity';

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
    ]),
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
