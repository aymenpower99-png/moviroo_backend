import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Ride } from '../../domain/entities/ride.entity';
import { RideStatus } from '../../domain/enums/ride-status.enum';
import { User, UserRole } from '../../../users/entites/user.entity';
import { CancelRideDto } from '../dtos/cancel-ride.dto';
import { DriverLocation } from '../../../dispatch/domain/entities/driver-location.entity';
import {
  Driver,
  DriverAvailabilityStatus,
} from '../../../driver/entities/driver.entity';
import {
  TripPayment,
  PaymentStatus,
} from '../../../billing/entities/trip-payment.entity';
import { PassengerNotificationService } from '../../../notifications/services/passenger-notification.service';

@Injectable()
export class CancelRideUseCase {
  private readonly logger = new Logger(CancelRideUseCase.name);

  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(DriverLocation)
    private readonly locRepo: Repository<DriverLocation>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(TripPayment)
    private readonly paymentRepo: Repository<TripPayment>,
    private readonly passengerNotif: PassengerNotificationService,
  ) {}

  async execute(
    currentUser: User,
    rideId: string,
    dto?: CancelRideDto,
  ): Promise<Ride> {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['vehicleClass'],
    });
    if (!ride) throw new NotFoundException('Ride not found');

    // Get payment method for notifications
    const payment = await this.paymentRepo.findOne({ where: { rideId } });
    const paymentMethod = payment?.paymentMethod ?? undefined;

    /* Authorization */
    if (
      currentUser.role !== UserRole.SUPER_ADMIN &&
      ride.passengerId !== currentUser.id
    ) {
      throw new ForbiddenException('You can only cancel your own rides');
    }

    /* Can only cancel before driver picks up */
    const cancellable: RideStatus[] = [
      RideStatus.PENDING,
      RideStatus.SCHEDULED,
      RideStatus.SEARCHING_DRIVER,
      RideStatus.ASSIGNED,
    ];
    if (!cancellable.includes(ride.status)) {
      throw new ConflictException(
        `Cannot cancel a ride in ${ride.status} status`,
      );
    }

    ride.status = RideStatus.CANCELLED;
    ride.cancelledAt = new Date();
    ride.cancellationReason = dto?.cancellation_reason ?? null;

    // Track who cancelled
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      ride.cancelledBy = 'ADMIN';
    } else if (ride.passengerId === currentUser.id) {
      ride.cancelledBy = 'PASSENGER';
    } else {
      ride.cancelledBy = 'DRIVER';
    }

    await this.rideRepo.save(ride);

    // Send push notification to passenger about cancellation
    if (ride.passengerId) {
      if (ride.cancelledBy === 'PASSENGER') {
        this.passengerNotif.rideCancelledByPassenger(
          ride.passengerId,
          ride.id,
          paymentMethod,
        );
      } else if (ride.cancelledBy === 'DRIVER') {
        this.passengerNotif.rideCancelledByDriver(
          ride.passengerId,
          ride.id,
          paymentMethod,
        );
      } else if (ride.cancelledBy === 'ADMIN') {
        this.passengerNotif.rideCancelledByAdmin(
          ride.passengerId,
          ride.id,
          ride.cancellationReason ?? undefined,
          paymentMethod,
        );
      }
    }

    /* Remove PENDING billing record — cancelled rides should not appear in billing */
    try {
      const payment = await this.paymentRepo.findOne({ where: { rideId } });
      if (payment && payment.paymentStatus === PaymentStatus.PENDING) {
        await this.paymentRepo.remove(payment);
        this.logger.log(
          `[BILLING] Removed PENDING TripPayment for cancelled ride ${rideId}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `[BILLING] Failed to remove TripPayment for cancelled ride ${rideId}: ${err}`,
      );
    }

    // If a driver was assigned, free them so they can receive the next dispatch.
    if (ride.driverId) {
      await this.locRepo.update(
        { driverId: ride.driverId },
        { lastSeenAt: new Date() },
      );
      await this.driverRepo.update(
        { userId: ride.driverId },
        { availabilityStatus: DriverAvailabilityStatus.ONLINE },
      );
      this.logger.log(
        `♻️ Ride ${rideId} cancelled (was ASSIGNED) → driver ${ride.driverId.slice(0, 8)} freed: status=ONLINE`,
      );
    }

    return ride;
  }
}
