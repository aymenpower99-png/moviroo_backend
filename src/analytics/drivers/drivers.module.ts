import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver } from '../../driver/entities/driver.entity';
import { DriversAnalyticsService } from './drivers.service.js';
import { DriversAnalyticsController } from './drivers.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Driver])],
  providers: [DriversAnalyticsService],
  controllers: [DriversAnalyticsController],
})
export class DriversAnalyticsModule {}
