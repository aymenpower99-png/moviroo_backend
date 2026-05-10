import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Ride } from '../domain/entities/ride.entity';
import { RideStatus } from '../domain/enums/ride-status.enum';
import { PassengerNotificationService } from '../../notifications/services/passenger-notification.service';

@Injectable()
export class AutoCancelPendingRidesTask {
  private readonly logger = new Logger(AutoCancelPendingRidesTask.name);

  constructor(
    @InjectRepository(Ride) private rideRepo: Repository<Ride>,
    private passengerNotif: PassengerNotificationService,
    private config: ConfigService,
  ) {}

  // Runs every minute to check for pending rides that timed out
  @Cron(CronExpression.EVERY_MINUTE)
  async handleAutoCancel() {
    const timeoutMinutes = this.config.get<number>(
      'PAYMENT_TIMEOUT_MINUTES',
      30,
    );
    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - timeoutMinutes);

    // Find rides in PENDING status that are older than the timeout
    const pendingRides = await this.rideRepo.find({
      where: {
        status: RideStatus.PENDING,
        createdAt: LessThan(cutoff),
      },
      relations: ['passenger'],
    });

    if (pendingRides.length === 0) {
      return;
    }

    this.logger.log(
      `Found ${pendingRides.length} pending ride(s) older than ${timeoutMinutes} minutes - auto-cancelling`,
    );

    for (const ride of pendingRides) {
      try {
        ride.status = RideStatus.CANCELLED;
        ride.cancelledAt = new Date();
        ride.cancelledBy = 'SYSTEM';
        ride.cancellationReason =
          'Payment timeout - no payment received within time limit';
        await this.rideRepo.save(ride);

        // Send notification to passenger
        await this.passengerNotif.rideCancelledByAdmin(
          ride.passengerId,
          ride.id,
          ride.cancellationReason,
        );

        this.logger.log(
          `Auto-cancelled ride ${ride.id} for passenger ${ride.passengerId}`,
        );
      } catch (err) {
        this.logger.error(`Failed to auto-cancel ride ${ride.id}: ${err}`);
      }
    }
  }
}
