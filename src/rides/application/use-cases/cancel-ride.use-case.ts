import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Ride } from '../../domain/entities/ride.entity';
import { RideStatus } from '../../domain/enums/ride-status.enum';
import { User, UserRole } from '../../../users/entites/user.entity';
import { CancelRideDto } from '../dtos/cancel-ride.dto';

@Injectable()
export class CancelRideUseCase {
  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
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

    // TODO Phase 2: notify assigned driver if status was ASSIGNED

    return ride;
  }
}
