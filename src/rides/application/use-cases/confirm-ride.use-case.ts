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

@Injectable()
export class ConfirmRideUseCase {
  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
  ) {}

  async execute(currentUser: User, rideId: string): Promise<Ride> {
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
      throw new ForbiddenException('You can only confirm your own rides');
    }

    if (ride.status !== RideStatus.PENDING) {
      throw new ConflictException(
        `Cannot confirm a ride in ${ride.status} status`,
      );
    }

    /* Lock price and transition */
    ride.priceFinal = ride.priceEstimate;
    ride.status = RideStatus.SEARCHING_DRIVER;
    ride.confirmedAt = new Date();

    await this.rideRepo.save(ride);

    // TODO Phase 2: emit dispatch event to find a driver

    return ride;
  }
}
