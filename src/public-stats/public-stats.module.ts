import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublicStatsController } from './public-stats.controller';
import { PublicStatsService } from './public-stats.service';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { Ride } from '../rides/domain/entities/ride.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle, Ride])],
  controllers: [PublicStatsController],
  providers: [PublicStatsService],
})
export class PublicStatsModule {}
