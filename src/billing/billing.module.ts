import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TripPayment } from './entities/trip-payment.entity';
import { CommissionTier } from './entities/commission-tier.entity';
import { Driver } from '../driver/entities/driver.entity';
import { User } from '../users/entites/user.entity';
import { Ride } from '../rides/domain/entities/ride.entity';
import { PassengerEntity } from '../passenger/entities/passengers.entity';

import { BillingService } from './services/billing.service';
import { PaymentService } from './services/payment.service';
import { SavedCardsService } from './services/saved-cards.service';
import { DriverEarningsService } from './services/driver-earnings.service';
import { BillingController } from './billing.controller';
import { DispatchModule } from '../dispatch/dispatch.module';

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
    forwardRef(() => DispatchModule),
  ],
  controllers: [BillingController],
  providers: [BillingService, PaymentService, SavedCardsService, DriverEarningsService],
  exports: [BillingService, DriverEarningsService, PaymentService, SavedCardsService],
})
export class BillingModule {}
