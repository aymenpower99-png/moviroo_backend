import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entites/user.entity';
import { Driver } from '../driver/entities/driver.entity';
import { FcmService } from './services/fcm.service';
import { DriverNotificationService } from './services/driver-notification.service';

/**
 * Notifications split into focused services:
 *   FcmService                 → low-level FCM (SDK init, token register, raw push)
 *   DriverNotificationService  → high-level driver events (ride accepted, cancelled,
 *                                status changes, chat messages, ...)
 *
 * Add a new service file under ./services/ whenever a new notification domain
 * emerges (e.g., passenger-notification.service.ts) and export it from here.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, Driver])],
  providers: [FcmService, DriverNotificationService],
  exports: [FcmService, DriverNotificationService],
})
export class NotificationsModule {}
