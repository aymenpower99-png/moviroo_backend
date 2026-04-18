  import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
  import * as admin from 'firebase-admin';
  import { InjectRepository } from '@nestjs/typeorm';
  import { Repository } from 'typeorm';
  import { User } from '../users/entites/user.entity';

  @Injectable()
  export class FcmService implements OnModuleInit {
    private readonly logger = new Logger(FcmService.name);
    private initialized = false;

    constructor(
      @InjectRepository(User)
      private readonly userRepo: Repository<User>,
    ) {}

    onModuleInit() {
      try {
        if (admin.apps.length > 0) {
          this.initialized = true;
          return;
        }

        // Strategy 1: individual env vars (no JSON file needed)
        const projectId   = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

        if (projectId && clientEmail && privateKey) {
          admin.initializeApp({
            credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
          });
          this.initialized = true;
          this.logger.log('✅ Firebase Admin SDK initialized via environment variables');
          return;
        }

        // Strategy 2: JSON file (FIREBASE_SERVICE_ACCOUNT_PATH or firebase-service-account.json)
        const serviceAccountPath =
          process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
          'firebase-service-account.json';

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const serviceAccount = require(require('path').resolve(serviceAccountPath));

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.initialized = true;
        this.logger.log('✅ Firebase Admin SDK initialized via service account file');
      } catch (err) {
        this.logger.warn(
          `⚠️ Firebase Admin SDK NOT initialized — push notifications disabled.\n` +
          `   Option A (env vars): Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY\n` +
          `   Option B (file):     Place firebase-service-account.json in project root\n` +
          `   Error: ${(err as Error).message}`,
        );
      }
    }

    /** Register or update a driver's FCM token */
    async registerToken(userId: string, token: string): Promise<void> {
      await this.userRepo.update({ id: userId }, { fcmToken: token });
      this.logger.log(`FCM token registered for user ${userId.slice(0, 8)}`);
    }

    /** Send push notification to a specific user */
    async sendToUser(
      userId: string,
      title: string,
      body: string,
      data?: Record<string, string>,
    ): Promise<boolean> {
      if (!this.initialized) {
        this.logger.warn('FCM not initialized — skipping push');
        return false;
      }

      const user = await this.userRepo.findOne({
        where: { id: userId },
        select: ['id', 'fcmToken'],
      });

      if (!user?.fcmToken) {
        this.logger.warn(`No FCM token for user ${userId.slice(0, 8)}`);
        return false;
      }

      try {
        await admin.messaging().send({
          token: user.fcmToken,
          notification: { title, body },
          data: data ?? {},
          android: {
            priority: 'high',
            notification: {
              channelId: 'ride_offers',
              priority: 'max',
              sound: 'default',
            },
          },
        });
        this.logger.log(` Push sent to ${userId.slice(0, 8)}: "${title}"`);
        return true;
      } catch (err) {
        const errorMsg = (err as Error).message;
        this.logger.error(`FCM send failed for ${userId.slice(0, 8)}: ${errorMsg}`);

        // Remove invalid tokens
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
        ' New Ride Request',
        `${pickupAddress} → ${dropoffAddress}`,
        {
          type: 'RIDE_OFFER',
          offerId,
          pickupAddress,
          dropoffAddress,
          price: String(price),
          distanceKm: String(distanceKm),
        },
      );
    }

    /** Notify driver that a ride was cancelled by passenger */
    async sendRideCancelled(driverId: string, rideId: string): Promise<boolean> {
      return this.sendToUser(
        driverId,
        '❌ Ride Cancelled',
        'The passenger has cancelled this ride.',
        { type: 'RIDE_CANCELLED', rideId },
      );
    }
  }
