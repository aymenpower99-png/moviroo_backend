import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverLocation } from '../../dispatch/domain/entities/driver-location.entity';
import { Driver } from '../../driver/entities/driver.entity';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { TripWaypoint } from '../../trips/domain/entities/trip-waypoint.entity';
import { LiveMapController } from './live-map.controller';
import { LiveMapService } from './live-map.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriverLocation,
      Driver,
      Ride,
      TripWaypoint,
    ]),
  ],
  controllers: [LiveMapController],
  providers: [LiveMapService],
  exports: [LiveMapService],
})
export class LiveMapModule {}
