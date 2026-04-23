import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Ride } from './domain/entities/ride.entity';
import { PassengerEntity } from '../passenger/entities/passengers.entity';
import { VehicleClass } from '../classes/entities/class.entity';
import { DispatchOffer } from '../dispatch/domain/entities/dispatch-offer.entity';
import { TripPayment } from '../billing/entities/trip-payment.entity';
import { DriverLocation } from '../dispatch/domain/entities/driver-location.entity';
import { Driver } from '../driver/entities/driver.entity';

import { RidesController } from './rides.controller';

import { CreateRideUseCase } from './application/use-cases/create-ride.use-case';
import { ConfirmRideUseCase } from './application/use-cases/confirm-ride.use-case';
import { CancelRideUseCase } from './application/use-cases/cancel-ride.use-case';
import { GetVehiclePricesUseCase } from './application/use-cases/get-vehicle-prices.use-case';

import { HaversineService } from './infrastructure/services/haversine.service';
import { GeocodingService } from './infrastructure/services/geocoding.service';
import { PricingService } from './infrastructure/services/pricing.service';

import { DispatchModule } from '../dispatch/dispatch.module';
import { ClassesModule } from '../classes/classes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Ride,
      PassengerEntity,
      VehicleClass,
      DispatchOffer,
      TripPayment,
      DriverLocation,
      Driver,
    ]),
    DispatchModule,
    ClassesModule,
  ],
  controllers: [RidesController],
  providers: [
    CreateRideUseCase,
    ConfirmRideUseCase,
    CancelRideUseCase,
    GetVehiclePricesUseCase,
    HaversineService,
    GeocodingService,
    PricingService,
  ],
  exports: [CreateRideUseCase, ConfirmRideUseCase, CancelRideUseCase],
})
export class RidesModule {}
