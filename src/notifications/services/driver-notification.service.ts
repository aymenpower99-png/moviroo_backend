import { Injectable, Logger } from '@nestjs/common';
import { FcmService } from './fcm.service';
import { RideStatus } from '../../rides/domain/enums/ride-status.enum';

/**
 * High-level, domain-specific push notifications sent to drivers.
 * Add new events here as the app grows (accepted ride, chat, status, ...).
 *
 * Every method is a thin wrapper around FcmService.sendToUser, so:
 *   - All returns are booleans (true = delivered, false = skipped/failed).
 *   - Never throws: safe to call from controllers/use-cases without try/catch.
 *   - Driver's push-enabled toggle is honored automatically.
 */
@Injectable()
export class DriverNotificationService {
  private readonly logger = new Logger(DriverNotificationService.name);

  constructor(private readonly fcm: FcmService) {}

  // ─── Ride lifecycle ───────────────────────────────────────────────────────

  /** Driver just accepted a ride — confirmation push (mostly for multi-device). */
  async rideAccepted(driverId: string, rideId: string, passengerName: string) {
    return this.fcm.sendToUser(
      driverId,
      'notif_ride_accepted_title',
      'notif_ride_accepted_body',
      { type: 'RIDE_ACCEPTED', rideId, channelId: 'ride_updates' },
      false, // Use data-only for custom icon
    );
  }

  /** Driver-initiated cancellation confirmation. */
  async rideCancelledByDriver(driverId: string, rideId: string) {
    return this.fcm.sendToUser(
      driverId,
      'notif_ride_cancelled_by_driver_title',
      'notif_ride_cancelled_by_driver_body',
      { type: 'RIDE_CANCELLED_BY_DRIVER', rideId, channelId: 'ride_updates' },
      false, // Use data-only for custom icon
    );
  }

  /** Passenger cancelled the ride — notify the driver. */
  async rideCancelledByPassenger(driverId: string, rideId: string) {
    return this.fcm.sendToUser(
      driverId,
      'notif_ride_cancelled_by_passenger_title',
      'notif_ride_cancelled_by_passenger_body',
      {
        type: 'RIDE_CANCELLED_BY_PASSENGER',
        rideId,
        channelId: 'ride_updates',
      },
      false, // Use data-only for custom icon
    );
  }

  /** Admin cancelled the ride — notify the driver with reason. */
  async rideCancelledByAdmin(
    driverId: string,
    rideId: string,
    reason?: string,
  ) {
    return this.fcm.sendToUser(
      driverId,
      'notif_ride_cancelled_by_admin_title',
      'notif_ride_cancelled_by_admin_body',
      {
        type: 'RIDE_CANCELLED_BY_ADMIN',
        rideId,
        reason: reason ?? '',
        channelId: 'ride_updates',
      },
      false, // Use data-only for custom icon
    );
  }

  // ─── Ride status changes ──────────────────────────────────────────────────

  /**
   * Generic status update push (matches RideStatus enum).
   * Pass the actual RideStatus enum value; title/body are built automatically.
   */
  async rideStatusChanged(
    driverId: string,
    rideId: string,
    status: RideStatus,
  ) {
    const { title, body } = this.buildStatusCopy(status);
    return this.fcm.sendToUser(
      driverId,
      title,
      body,
      {
        type: 'RIDE_STATUS_CHANGED',
        rideId,
        status,
        channelId: 'ride_updates',
      },
      false,
    ); // Use data-only for custom icon
  }

  private buildStatusCopy(status: RideStatus): { title: string; body: string } {
    switch (status) {
      case RideStatus.EN_ROUTE_TO_PICKUP:
        return {
          title: 'notif_ride_status_en_route_title',
          body: 'notif_ride_status_en_route_body',
        };
      case RideStatus.ARRIVED:
        return {
          title: 'notif_ride_status_arrived_title',
          body: 'notif_ride_status_arrived_body',
        };
      case RideStatus.IN_TRIP:
        return {
          title: 'notif_ride_status_in_trip_title',
          body: 'notif_ride_status_in_trip_body',
        };
      case RideStatus.COMPLETED:
        return {
          title: 'notif_ride_status_completed_title',
          body: 'notif_ride_status_completed_body',
        };
      default:
        return {
          title: 'notif_ride_status_changed_title',
          body: 'notif_ride_status_changed_body',
        };
    }
  }

  // ─── Tier / Commission ───────────────────────────────────────────────────

  /** Driver unlocked a new commission tier. */
  async tierUnlocked(
    driverId: string,
    tierName: string,
    commissionRate: number,
    monthlyRides: number,
  ) {
    const ratePercent = Math.round(commissionRate * 100);
    return this.fcm.sendToUser(
      driverId,
      'notif_tier_unlocked_title',
      'notif_tier_unlocked_body',
      {
        type: 'TIER_UNLOCKED',
        tierName,
        commissionRate: String(commissionRate),
        monthlyRides: String(monthlyRides),
        channelId: 'ride_updates',
      },
      false, // Use data-only for custom icon
    );
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────

  /** New chat message from a passenger. */
  async newMessageFromPassenger(
    driverId: string,
    rideId: string,
    passengerName: string,
    messagePreview: string,
  ) {
    return this.fcm.sendToUser(
      driverId,
      passengerName,
      messagePreview,
      {
        type: 'CHAT_MESSAGE',
        rideId,
        senderName: passengerName,
        channelId: 'chat_messages',
        title: passengerName,
        body: messagePreview,
      },
      true, // Include notification to show title and body
    );
  }
}
