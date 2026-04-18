import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DriverLocation } from './domain/entities/driver-location.entity';
import { DispatchOffer } from './domain/entities/dispatch-offer.entity';
import { Ride } from '../rides/domain/entities/ride.entity';
import { Driver } from '../driver/entities/driver.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { User } from '../users/entites/user.entity';
import { WorkArea } from '../work-area/entities/work-area.entity';

import { DispatchController } from './dispatch.controller';

import { FindEligibleDriversUseCase } from './application/use-cases/find-eligible-drivers.use-case';
import { DispatchRideUseCase } from './application/use-cases/dispatch-ride.use-case';
import { RespondToOfferUseCase } from './application/use-cases/respond-to-offer.use-case';
import { ScoreDriversService } from './application/services/score-drivers.service';
import { FallbackDispatchService } from './application/services/fallback-dispatch.service';
import { HeartbeatService } from './application/services/heartbeat.service';
import { ScheduledDispatchService } from './application/services/scheduled-dispatch.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriverLocation,
      DispatchOffer,
      Ride,
      Driver,
      Vehicle,
      User,
      WorkArea,
    ]),
    NotificationsModule,
  ],
  controllers: [DispatchController],
  providers: [
    FindEligibleDriversUseCase,
    DispatchRideUseCase,
    RespondToOfferUseCase,
    ScoreDriversService,
    FallbackDispatchService,
    HeartbeatService,
    ScheduledDispatchService,
  ],
  exports: [FallbackDispatchService],
})
export class DispatchModule {}
