import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { RidesAnalyticsService } from './rides.service.js';
import { RidesAnalyticsController } from './rides.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Ride])],
  providers: [RidesAnalyticsService],
  controllers: [RidesAnalyticsController],
})
export class RidesAnalyticsModule {}
