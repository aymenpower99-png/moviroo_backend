import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver } from './entities/driver.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { User } from '../users/entites/user.entity';
import { WorkArea } from '../work-area/entities/work-area.entity';
import { DriverOnlineHistory } from '../earnings/entities/driver-online-history.entity';
import { Ride } from '../rides/domain/entities/ride.entity';
import { DispatchOffer } from '../dispatch/domain/entities/dispatch-offer.entity';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';
import { DriverProfileService } from './services/driver-profile.service';
import { DriverAvailabilityService } from './services/driver-availability.service';
import { DriverAdminService } from './services/driver-admin.service';
import { DriverMetricsService } from './services/driver-metrics.service';
import { EarningsModule } from '../earnings/earnings.module';
import { CloudinaryService } from '../common/services/cloudinary.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Driver,
      Vehicle,
      User,
      WorkArea,
      DriverOnlineHistory,
      Ride,
      DispatchOffer,
    ]),
    EarningsModule,
  ],
  controllers: [DriversController],
  providers: [
    DriversService,
    DriverProfileService,
    DriverAvailabilityService,
    DriverAdminService,
    DriverMetricsService,
    CloudinaryService,
  ],
  exports: [DriversService, DriverAvailabilityService],
})
export class DriversModule {}
