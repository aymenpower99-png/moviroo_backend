import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassengerEntity } from './entities/passengers.entity';
import { MembershipCouponEntity } from './entities/membership-coupon.entity';
import { PassengersService } from './passengers.service';
import { PassengersController } from './passengers.controller';
import { MembershipLevelsModule } from '../membership-levels/membership-levels.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/entites/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PassengerEntity, MembershipCouponEntity, User]),
    MembershipLevelsModule,
    NotificationsModule,
  ],
  controllers: [PassengersController],
  providers: [PassengersService],
  exports: [PassengersService],
})
export class PassengersModule {}
