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
      'Ride Accepted',
      `You are on the way to pick up ${passengerName}.`,
      { type: 'RIDE_ACCEPTED', rideId, channelId: 'ride_updates' },
    );
  }

  /** Driver-initiated cancellation confirmation. */
  async rideCancelledByDriver(driverId: string, rideId: string) {
    return this.fcm.sendToUser(
      driverId,
      'Ride Cancelled',
      'You have cancelled this ride.',
      { type: 'RIDE_CANCELLED_BY_DRIVER', rideId, channelId: 'ride_updates' },
    );
  }

  /** Passenger cancelled the ride — notify the driver. */
  async rideCancelledByPassenger(driverId: string, rideId: string) {
    return this.fcm.sendToUser(
      driverId,
      'Ride Cancelled',
      'The passenger has cancelled this ride.',
      {
        type: 'RIDE_CANCELLED_BY_PASSENGER',
        rideId,
        channelId: 'ride_updates',
      },
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
      'Ride Cancelled by Admin',
      reason?.trim()
        ? `This ride was cancelled by an admin. Reason: ${reason}`
        : 'This ride was cancelled by an admin.',
      {
        type: 'RIDE_CANCELLED_BY_ADMIN',
        rideId,
        reason: reason ?? '',
        channelId: 'ride_updates',
      },
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
    return this.fcm.sendToUser(driverId, title, body, {
      type: 'RIDE_STATUS_CHANGED',
      rideId,
      status,
      channelId: 'ride_updates',
    });
  }

  private buildStatusCopy(status: RideStatus): { title: string; body: string } {
    switch (status) {
      case RideStatus.EN_ROUTE_TO_PICKUP:
        return {
          title: 'Ride Started',
          body: 'You are on the way to the pickup point.',
        };
      case RideStatus.ARRIVED:
        return {
          title: 'Arrived at Pickup',
          body: 'You have arrived at the pickup point.',
        };
      case RideStatus.IN_TRIP:
        return {
          title: 'Trip In Progress',
          body: 'The trip is now in progress.',
        };
      case RideStatus.COMPLETED:
        return {
          title: 'Ride Completed',
          body: 'The ride has been completed. Great job!',
        };
      default:
        return { title: 'Ride Update', body: `Status: ${status}` };
    }
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────

  /** New chat message from a passenger. */
  async newMessageFromPassenger(
    driverId: string,
    rideId: string,
    passengerName: string,
    messagePreview: string,
  ) {
    return this.fcm.sendToUser(driverId, passengerName, messagePreview, {
      type: 'CHAT_MESSAGE',
      rideId,
      senderName: passengerName,
      channelId: 'chat_messages',
    });
  }
}
