import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TripPayment } from './entities/trip-payment.entity';
import { CommissionTier } from './entities/commission-tier.entity';
import { Driver } from '../driver/entities/driver.entity';
import { User } from '../users/entites/user.entity';
import { Ride } from '../rides/domain/entities/ride.entity';
import { PassengerEntity } from '../passenger/entities/passengers.entity';

import { BillingService } from './services/billing.service';
import { PaymentService } from './services/payment.service';
import { DriverEarningsService } from './services/driver-earnings.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TripPayment,
      CommissionTier,
      Driver,
      User,
      Ride,
      PassengerEntity,
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService, PaymentService, DriverEarningsService],
  exports: [BillingService, DriverEarningsService],
})
export class BillingModule {}
