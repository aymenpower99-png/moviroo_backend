import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';

import { Ride } from './domain/entities/ride.entity';
import { RouteHistory } from './domain/entities/route-history.entity';
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
import { GeocodingService } from './infrastructure/services/geocoding/geocoding.service';
import { GeocodingMapboxService } from './infrastructure/services/geocoding/geocoding-mapbox.service';
import { GeocodingNominatimService } from './infrastructure/services/geocoding/geocoding-nominatim.service';
import { PricingService } from './infrastructure/services/pricing/pricing.service';
import { PricingMlService } from './infrastructure/services/pricing/pricing-ml.service';
import { PricingFallbackService } from './infrastructure/services/pricing/pricing-fallback.service';
import { RoutingService } from './infrastructure/services/routing/routing.service';
import { RouteCalculationService } from './infrastructure/services/routing/route-calculation.service';
import { RouteProgressService } from './infrastructure/services/routing/route-progress.service';
import { RouteCacheService } from './infrastructure/services/routing/route-cache.service';
import { RouteCooldownService } from './infrastructure/services/routing/route-cooldown.service';
import { RouteSnappingService } from './infrastructure/services/route-snapping.service';
import { GpsSmoothingService } from './infrastructure/services/gps-smoothing.service';
import { RouteHistoryRepository } from './infrastructure/repositories/route-history.repository';

import { DispatchModule } from '../dispatch/dispatch.module';
import { ClassesModule } from '../classes/classes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Ride,
      RouteHistory,
      PassengerEntity,
      VehicleClass,
      DispatchOffer,
      TripPayment,
      DriverLocation,
      Driver,
    ]),
    CacheModule.register({
      isGlobal: true,
      ttl: 300, // 5 minutes default TTL
      max: 100, // Maximum number of items in cache
    }),
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
    GeocodingMapboxService,
    GeocodingNominatimService,
    PricingService,
    PricingMlService,
    PricingFallbackService,
    RoutingService,
    RouteCalculationService,
    RouteProgressService,
    RouteCacheService,
    RouteCooldownService,
    RouteSnappingService,
    GpsSmoothingService,
    RouteHistoryRepository,
  ],
  exports: [
    CreateRideUseCase,
    ConfirmRideUseCase,
    CancelRideUseCase,
    RoutingService,
    RouteHistoryRepository,
    RouteSnappingService,
  ],
})
export class RidesModule {}
