import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassengerEntity } from '../../passenger/entities/passengers.entity';
import { PassengersAnalyticsService } from './passengers.service.js';
import { PassengersAnalyticsController } from './passengers.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([PassengerEntity])],
  providers: [PassengersAnalyticsService],
  controllers: [PassengersAnalyticsController],
})
export class PassengersAnalyticsModule {}
