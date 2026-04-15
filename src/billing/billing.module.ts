import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TripPayment } from './entities/trip-payment.entity';
import { Transaction } from './entities/transaction.entity';
import { DriverEarning } from './entities/driver-earning.entity';
import { Driver } from '../driver/entities/driver.entity';
import { PassengerEntity } from '../passenger/entities/passengers.entity';

import { BillingService } from './services/billing.service';
import { PaymentService } from './services/payment.service';
import { DriverEarningsService } from './services/driver-earnings.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TripPayment,
      Transaction,
      DriverEarning,
      Driver,
      PassengerEntity,
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService, PaymentService, DriverEarningsService],
  exports: [BillingService],
})
export class BillingModule {}
