import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { VehiclesAnalyticsService } from './vehicles.service.js';
import { VehiclesAnalyticsController } from './vehicles.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle])],
  providers: [VehiclesAnalyticsService],
  controllers: [VehiclesAnalyticsController],
})
export class VehiclesAnalyticsModule {}
