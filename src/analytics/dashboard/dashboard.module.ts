import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { Driver } from '../../driver/entities/driver.entity';
import { SupportTicket } from '../../support/entities/support-ticket.entity';
import { RideRating } from '../../trips/domain/entities/ride-rating.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { DashboardAnalyticsService } from './dashboard.service.js';
import { DashboardAnalyticsController } from './dashboard.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Ride,
      Driver,
      SupportTicket,
      RideRating,
      Vehicle,
    ]),
  ],
  providers: [DashboardAnalyticsService],
  controllers: [DashboardAnalyticsController],
})
export class DashboardAnalyticsModule {}
