import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entites/user.entity';
import { Driver } from '../driver/entities/driver.entity';
import { FcmService } from './services/fcm.service';
import { DriverNotificationService } from './services/driver-notification.service';
import { PassengerNotificationService } from './services/passenger-notification.service';
import { NotificationsController } from './notifications.controller';
import { I18nModule } from '../i18n/i18n.module';

/**
 * Notifications split into focused services:
 *   FcmService                    → low-level FCM (SDK init, token register, raw push)
 *   DriverNotificationService     → high-level driver events (ride accepted, cancelled,
 *                                   status changes, chat messages, ...)
 *   PassengerNotificationService  → high-level passenger events (ride accepted, cancelled,
 *                                   status changes, chat messages, payments, membership, ...)
 *
 * Add a new service file under ./services/ whenever a new notification domain
 * emerges (e.g., passenger-notification.service.ts) and export it from here.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, Driver]), I18nModule],
  controllers: [NotificationsController],
  providers: [
    FcmService,
    DriverNotificationService,
    PassengerNotificationService,
  ],
  exports: [
    FcmService,
    DriverNotificationService,
    PassengerNotificationService,
  ],
})
export class NotificationsModule {}
