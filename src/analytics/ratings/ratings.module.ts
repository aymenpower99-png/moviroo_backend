import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RideRating } from '../../trips/domain/entities/ride-rating.entity';
import { RatingsAnalyticsService } from './ratings.service.js';
import { RatingsAnalyticsController } from './ratings.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([RideRating])],
  providers: [RatingsAnalyticsService],
  controllers: [RatingsAnalyticsController],
})
export class RatingsAnalyticsModule {}
