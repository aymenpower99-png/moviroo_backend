import { Injectable, Logger } from '@nestjs/common';
import { FcmService } from './fcm.service';
import { RideStatus } from '../../rides/domain/enums/ride-status.enum';

/**
 * High-level, domain-specific push notifications sent to passengers.
 * Add new events here as the app grows (ride accepted, status changes, chat, ...).
 *
 * Every method is a thin wrapper around FcmService.sendToUser, so:
 *   - All returns are booleans (true = delivered, false = skipped/failed).
 *   - Never throws: safe to call from controllers/use-cases without try/catch.
 *   - Passenger's push-enabled toggle is honored automatically.
 */
@Injectable()
export class PassengerNotificationService {
  private readonly logger = new Logger(PassengerNotificationService.name);

  constructor(private readonly fcm: FcmService) {}

  // ─── Ride lifecycle ───────────────────────────────────────────────────────

  /** Driver assigned to the ride — notify the passenger. */
  async driverAssigned(
    passengerId: string,
    rideId: string,
    driverName: string,
    driverLogoUrl?: string,
    driverId?: string,
    vehicleName?: string,
    vehicleColor?: string,
    plateNumber?: string,
  ) {
    return this.fcm.sendToUser(
      passengerId,
      'Driver Assigned',
      `${driverName} has been assigned to your ride.`,
      {
        type: 'DRIVER_ASSIGNED',
        rideId,
        driverName,
        driverLogoUrl: driverLogoUrl ?? '',
        driverId: driverId ?? '',
        vehicleName: vehicleName ?? '',
        vehicleColor: vehicleColor ?? '',
        plateNumber: plateNumber ?? '',
        channelId: 'ride_updates',
      },
    );
  }

  /** Driver accepted the ride — notify the passenger. */
  async rideAccepted(
    passengerId: string,
    rideId: string,
    driverName: string,
    driverLogoUrl?: string,
  ) {
    return this.fcm.sendToUser(
      passengerId,
      'Driver Accepted',
      `${driverName} is on the way to pick you up.`,
      { type: 'RIDE_ACCEPTED', rideId, driverName, driverLogoUrl: driverLogoUrl ?? '', channelId: 'ride_updates' },
    );
  }

  /** Passenger-initiated cancellation confirmation. */
  async rideCancelledByPassenger(
    passengerId: string,
    rideId: string,
    paymentMethod?: string,
  ) {
    const body =
      paymentMethod === 'CARD'
        ? 'You have cancelled this ride. Your refund will be processed.'
        : 'You have cancelled this ride.';

    return this.fcm.sendToUser(passengerId, 'Ride Cancelled', body, {
      type: 'RIDE_CANCELLED_BY_PASSENGER',
      rideId,
      channelId: 'ride_updates',
    });
  }

  /** Driver cancelled the ride — notify the passenger. */
  async rideCancelledByDriver(
    passengerId: string,
    rideId: string,
    paymentMethod?: string,
  ) {
    const body =
      paymentMethod === 'CARD'
        ? 'The driver has cancelled this ride. Your refund will be processed.'
        : 'The driver has cancelled this ride.';

    this.logger.log(
      `[PassengerNotif] Sending rideCancelledByDriver to passenger ${passengerId.slice(0, 8)} for ride ${rideId} (payment: ${paymentMethod})`,
    );
    const result = await this.fcm.sendToUser(
      passengerId,
      'Ride Cancelled',
      body,
      {
        type: 'RIDE_CANCELLED_BY_DRIVER',
        rideId,
        channelId: 'ride_updates',
      },
    );
    this.logger.log(
      `[PassengerNotif] rideCancelledByDriver result: ${result ? 'SUCCESS' : 'FAILED/SKIPPED'}`,
    );
    return result;
  }

  /** Admin cancelled the ride — notify the passenger with reason. */
  async rideCancelledByAdmin(
    passengerId: string,
    rideId: string,
    reason?: string,
    paymentMethod?: string,
  ) {
    // Special case: "No driver found" - use simple message without reason prefix
    if (reason === 'No driver found') {
      const body =
        paymentMethod === 'CARD'
          ? 'No driver found. Your refund will be processed.'
          : 'No driver found.';
      return this.fcm.sendToUser(passengerId, 'Ride Cancelled', body, {
        type: 'RIDE_CANCELLED_BY_ADMIN',
        rideId,
        reason: reason ?? '',
        channelId: 'ride_updates',
      });
    }

    const body =
      paymentMethod === 'CARD'
        ? reason?.trim()
          ? `This ride has been cancelled. Reason: ${reason}. Your refund will be processed.`
          : 'This ride has been cancelled. Your refund will be processed.'
        : reason?.trim()
          ? `This ride has been cancelled. Reason: ${reason}`
          : 'This ride has been cancelled.';

    return this.fcm.sendToUser(passengerId, 'Ride Cancelled', body, {
      type: 'RIDE_CANCELLED_BY_ADMIN',
      rideId,
      reason: reason ?? '',
      channelId: 'ride_updates',
    });
  }

  // ─── Ride status changes ──────────────────────────────────────────────────

  /**
   * Generic status update push (matches RideStatus enum).
   * Pass the actual RideStatus enum value; title/body are built automatically.
   */
  async rideStatusChanged(
    passengerId: string,
    rideId: string,
    status: RideStatus,
    driverName?: string,
    driverLogoUrl?: string,
    driverId?: string,
    vehicleName?: string,
    vehicleColor?: string,
    plateNumber?: string,
  ) {
    const { title, body } = this.buildStatusCopy(status);
    return this.fcm.sendToUser(passengerId, title, body, {
      type: 'RIDE_STATUS_CHANGED',
      rideId,
      status: status.toString(),
      driverName: driverName ?? '',
      driverLogoUrl: driverLogoUrl ?? '',
      driverId: driverId ?? '',
      vehicleName: vehicleName ?? '',
      vehicleColor: vehicleColor ?? '',
      plateNumber: plateNumber ?? '',
      channelId: 'ride_updates',
    });
  }

  private buildStatusCopy(status: RideStatus): { title: string; body: string } {
    switch (status) {
      case RideStatus.EN_ROUTE_TO_PICKUP:
        return {
          title: 'Driver En Route',
          body: 'Your driver is on the way to the pickup point.',
        };
      case RideStatus.ARRIVED:
        return {
          title: 'Driver Arrived',
          body: 'Your driver has arrived at the pickup point.',
        };
      case RideStatus.IN_TRIP:
        return {
          title: 'Trip In Progress',
          body: 'Your trip is now in progress.',
        };
      case RideStatus.COMPLETED:
        return {
          title: 'Ride Completed',
          body: 'Your ride has been completed. Thank you for riding with Moviroo!',
        };
      default:
        return { title: 'Ride Update', body: `Status: ${status}` };
    }
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────

  /** New chat message from a driver. */
  async newMessageFromDriver(
    passengerId: string,
    rideId: string,
    driverName: string,
    messagePreview: string,
    driverLogoUrl?: string,
  ) {
    return this.fcm.sendToUser(passengerId, driverName, messagePreview, {
      type: 'CHAT_MESSAGE',
      rideId,
      senderName: driverName,
      driverLogoUrl: driverLogoUrl ?? '',
      channelId: 'chat_messages',
      title: driverName,
      body: messagePreview,
    });
  }

  // ─── Payment ───────────────────────────────────────────────────────────────

  /** Payment successful notification. */
  async paymentSuccessful(passengerId: string, rideId: string, amount: number) {
    return this.fcm.sendToUser(
      passengerId,
      'Payment Successful',
      'Your payment was successful.',
      {
        type: 'PAYMENT_SUCCESSFUL',
        rideId,
        amount: amount.toFixed(2),
        channelId: 'payments',
      },
    );
  }

  /** Payment failed notification. */
  async paymentFailed(passengerId: string, rideId: string) {
    return this.fcm.sendToUser(
      passengerId,
      'Payment Failed',
      'Your payment could not be processed. Please try again.',
      {
        type: 'PAYMENT_FAILED',
        rideId,
        channelId: 'payments',
      },
    );
  }

  /** Refund issued notification. */
  async refundIssued(passengerId: string, rideId: string, amount: number) {
    return this.fcm.sendToUser(
      passengerId,
      'Refund Issued',
      'Your refund has been processed. It may take 5-7 business days to appear in your account.',
      {
        type: 'REFUND_ISSUED',
        rideId,
        amount: amount.toFixed(2),
        channelId: 'payments',
      },
    );
  }

  // ─── Membership ────────────────────────────────────────────────────────────

  /** Membership level upgrade notification. */
  async membershipLevelUpgraded(
    passengerId: string,
    newLevel: string,
    benefits: string,
  ) {
    return this.fcm.sendToUser(
      passengerId,
      'Membership Upgraded',
      `Congratulations! You are now ${newLevel}. ${benefits}`,
      {
        type: 'MEMBERSHIP_UPGRADED',
        newLevel,
        channelId: 'membership',
      },
    );
  }

  /** Coupon reward notification. */
  async couponReward(
    passengerId: string,
    code: string,
    discountPercentage: number,
  ) {
    return this.fcm.sendToUser(
      passengerId,
      'Coupon Reward',
      `You received a ${discountPercentage}% discount coupon: ${code}`,
      {
        type: 'COUPON_REWARD',
        code,
        discountPercentage: discountPercentage.toString(),
        channelId: 'membership',
      },
    );
  }
}
