import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entites/user.entity';
import { Driver } from '../../driver/entities/driver.entity';
import { I18nService } from '../../i18n/i18n.service';

/**
 * Low-level Firebase Cloud Messaging service.
 * Handles SDK init, token registration, and raw push delivery.
 *
 * For higher-level, domain-specific pushes (ride accepted, cancelled, chat, ...)
 * use DriverNotificationService which composes this one.
 */
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private initialized = false;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Driver) private readonly driverRepo: Repository<Driver>,
    private readonly i18nService: I18nService,
  ) {}

  onModuleInit() {
    try {
      if (admin.apps.length > 0) {
        this.initialized = true;
        return;
      }

      // Strategy 1: individual env vars (no JSON file needed)
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(
        /\\n/g,
        '\n',
      );

      if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        this.initialized = true;
        this.logger.log(
          '✅ Firebase Admin SDK initialized via environment variables',
        );
        return;
      }

      // Strategy 2: JSON file (FIREBASE_SERVICE_ACCOUNT_PATH or firebase-service-account.json)
      const serviceAccountPath =
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
        'firebase-service-account.json';

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const serviceAccount = require(
        require('path').resolve(serviceAccountPath),
      );

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      this.initialized = true;
      this.logger.log(
        '✅ Firebase Admin SDK initialized via service account file',
      );
    } catch (err) {
      this.logger.warn(
        `⚠️ Firebase Admin SDK NOT initialized — push notifications disabled.\n` +
          `   Option A (env vars): Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY\n` +
          `   Option B (file):     Place firebase-service-account.json in project root\n` +
          `   Error: ${(err as Error).message}`,
      );
    }
  }

  /** Register or update a user's FCM token */
  async registerToken(userId: string, token: string): Promise<void> {
    await this.userRepo.update({ id: userId }, { fcmToken: token });
    this.logger.log(`FCM token registered for user ${userId.slice(0, 8)}`);
  }

  /** Send push notification to a specific user (respects push toggle for both driver and passenger) */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
    includeNotification = true,
  ): Promise<boolean> {
    this.logger.log(
      `[FCM] sendToUser called for ${userId.slice(0, 8)}: "${title}"`,
    );

    if (!this.initialized) {
      this.logger.warn('FCM not initialized — skipping push');
      return false;
    }

    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'fcmToken', 'pushNotificationsEnabled', 'role', 'language'],
    });

    this.logger.log(
      `[FCM] User lookup: role=${user?.role}, hasToken=${!!user?.fcmToken}, pushEnabled=${user?.pushNotificationsEnabled}`,
    );

    // Respect push-enabled toggle for both driver and passenger
    if (user?.pushNotificationsEnabled === false) {
      this.logger.log(
        `Push skipped (disabled by user) for ${user.role} ${userId.slice(0, 8)}`,
      );
      return false;
    }

    // Respect driver-specific push toggle
    const driver = await this.driverRepo.findOne({
      where: { userId },
      select: ['notifPushEnabled'],
    });
    if (driver && driver.notifPushEnabled === false) {
      this.logger.log(
        `Push skipped (disabled by driver) for user ${userId.slice(0, 8)}`,
      );
      return false;
    }

    if (!user?.fcmToken) {
      this.logger.warn(`No FCM token for user ${userId.slice(0, 8)}`);
      return false;
    }

    // Translate title and body if they are translation keys (start with 'notif_')
    const lang = user?.language || 'en';
    const isTitleKey = title.startsWith('notif_');
    const isBodyKey = body.startsWith('notif_');
    const finalTitle = isTitleKey ? this.i18nService.translate(title, lang) : title;
    const finalBody = isBodyKey ? this.i18nService.translate(body, lang) : body;

    try {
      const channelId = data?.channelId ?? 'ride_offers';
      const message: admin.messaging.Message = {
        token: user.fcmToken,
        data: { ...data, title: finalTitle, body: finalBody },
        android: {
          priority: 'high',
          notification: {
            channelId,
            priority: 'max',
          },
        },
      };

      if (includeNotification) {
        message.notification = { title: finalTitle, body: finalBody };
      }

      await admin.messaging().send(message);
      this.logger.log(` Push sent to ${userId.slice(0, 8)}: "${finalTitle}"`);
      return true;
    } catch (err) {
      const errorMsg = (err as Error).message;
      this.logger.error(
        `FCM send failed for ${userId.slice(0, 8)}: ${errorMsg}`,
      );

      if (
        errorMsg.includes('registration-token-not-registered') ||
        errorMsg.includes('invalid-registration-token')
      ) {
        await this.userRepo.update({ id: userId }, { fcmToken: null });
        this.logger.log(`Removed stale FCM token for ${userId.slice(0, 8)}`);
      }
      return false;
    }
  }

  /** Send ride offer notification to driver */
  async sendRideOffer(
    driverId: string,
    offerId: string,
    pickupAddress: string,
    dropoffAddress: string,
    price: number,
    distanceKm: number,
  ): Promise<boolean> {
    return this.sendToUser(
      driverId,
      'notif_ride_offer_title',
      `${pickupAddress} → ${dropoffAddress}`,
      {
        type: 'RIDE_OFFER',
        offerId,
        pickupAddress,
        dropoffAddress,
        price: String(price),
        distanceKm: String(distanceKm),
      },
      true, // Include notification to show title and body
    );
  }

  /** Notify driver that a ride was cancelled by passenger (legacy helper). */
  async sendRideCancelled(driverId: string, rideId: string): Promise<boolean> {
    return this.sendToUser(
      driverId,
      'notif_ride_cancelled_title',
      'notif_ride_cancelled_body',
      { type: 'RIDE_CANCELLED', rideId },
    );
  }

  /** Send push notification directly to a specific FCM token (bypasses user lookup) */
  async sendToToken(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<boolean> {
    if (!this.initialized) {
      this.logger.warn('FCM not initialized — skipping push');
      return false;
    }

    if (!token) {
      this.logger.warn('No FCM token provided');
      return false;
    }

    try {
      const channelId = data?.channelId ?? 'ride_offers';
      const message: admin.messaging.Message = {
        token,
        data: { ...data, title, body },
        android: {
          priority: 'high',
          notification: {
            channelId,
            priority: 'max',
          },
        },
      };

      await admin.messaging().send(message);
      this.logger.log(` Push sent to token: "${title}"`);
      return true;
    } catch (err) {
      const errorMsg = (err as Error).message;
      this.logger.error(`FCM send failed for token: ${errorMsg}`);
      return false;
    }
  }
}
