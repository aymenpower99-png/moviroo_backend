import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ride } from '../rides/domain/entities/ride.entity';
import { Driver } from '../driver/entities/driver.entity';
import { CommissionTier } from '../billing/entities/commission-tier.entity';
import { EarningsService } from './earnings.service';
import { EarningsDriverController } from './earnings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Ride, Driver, CommissionTier])],
  controllers: [EarningsDriverController],
  providers: [EarningsService],
  exports: [EarningsService],
})
export class EarningsModule {}
