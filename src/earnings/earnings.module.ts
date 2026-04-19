import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonthlyEarnings } from './entities/monthly-earnings.entity';
import { EarningsConfig } from './entities/earnings-config.entity';
import { Ride } from '../rides/domain/entities/ride.entity';
import { Driver } from '../driver/entities/driver.entity';
import { CommissionTier } from '../billing/entities/commission-tier.entity';
import { EarningsService } from './earnings.service';
import { EarningsDriverController, EarningsAdminController } from './earnings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MonthlyEarnings, EarningsConfig, Ride, Driver, CommissionTier])],
  controllers: [EarningsDriverController, EarningsAdminController],
  providers: [EarningsService],
  exports: [EarningsService],
})
export class EarningsModule {}
