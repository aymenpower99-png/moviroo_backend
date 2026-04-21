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
import { Driver, DriverAvailabilityStatus } from '../../../driver/entities/driver.entity';

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

    await this.rideRepo.save(ride);

    // If a driver was assigned, free them so they can receive the next dispatch.
    // Without this, is_on_trip stays true and the driver is invisible to dispatch.
    if (ride.driverId) {
      await this.locRepo.update(
        { driverId: ride.driverId },
        { isOnTrip: false, lastSeenAt: new Date() },
      );
      await this.driverRepo.update(
        { userId: ride.driverId },
        { availabilityStatus: DriverAvailabilityStatus.ONLINE },
      );
      this.logger.log(
        `♻️ Ride ${rideId} cancelled (was ASSIGNED) → driver ${ride.driverId.slice(0, 8)} freed: is_on_trip=false, status=ONLINE`,
      );
    }

    return ride;
  }
}