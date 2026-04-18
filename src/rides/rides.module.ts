import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Ride } from './domain/entities/ride.entity';
import { PassengerEntity } from '../passenger/entities/passengers.entity';
import { VehicleClass } from '../classes/entities/class.entity';
import { DispatchOffer } from '../dispatch/domain/entities/dispatch-offer.entity';

import { RidesController } from './rides.controller';

import { CreateRideUseCase } from './application/use-cases/create-ride.use-case';
import { ConfirmRideUseCase } from './application/use-cases/confirm-ride.use-case';
import { CancelRideUseCase } from './application/use-cases/cancel-ride.use-case';

import { HaversineService } from './infrastructure/services/haversine.service';
import { GeocodingService } from './infrastructure/services/geocoding.service';
import { PricingService } from './infrastructure/services/pricing.service';

import { DispatchModule } from '../dispatch/dispatch.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ride, PassengerEntity, VehicleClass, DispatchOffer]),
    DispatchModule,
  ],
  controllers: [RidesController],
  providers: [
    CreateRideUseCase,
    ConfirmRideUseCase,
    CancelRideUseCase,
    HaversineService,
    GeocodingService,
    PricingService,
  ],
  exports: [CreateRideUseCase, ConfirmRideUseCase, CancelRideUseCase],
})
export class RidesModule {}
