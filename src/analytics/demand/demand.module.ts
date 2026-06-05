import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { DemandAnalyticsService } from './demand.service.js';
import { DemandAnalyticsController } from './demand.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Ride])],
  controllers: [DemandAnalyticsController],
  providers: [DemandAnalyticsService],
  exports: [DemandAnalyticsService],
})
export class DemandAnalyticsModule {}
