import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Ride } from '../../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../../rides/domain/enums/ride-status.enum';
import { RideRating } from '../../domain/entities/ride-rating.entity';
import { Driver } from '../../../driver/entities/driver.entity';
import { PassengerEntity } from '../../../passenger/entities/passengers.entity';
import { User, UserRole } from '../../../users/entites/user.entity';
import { SubmitRatingDto } from '../dtos/submit-rating.dto';

@Injectable()
export class SubmitRatingUseCase {
  private readonly logger = new Logger(SubmitRatingUseCase.name);

  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(RideRating)
    private readonly ratingRepo: Repository<RideRating>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(PassengerEntity)
    private readonly passengerRepo: Repository<PassengerEntity>,
  ) {}

  async execute(
    currentUser: User,
    rideId: string,
    dto: SubmitRatingDto,
  ): Promise<RideRating> {
    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');

    if (ride.status !== RideStatus.COMPLETED) {
      throw new ConflictException('Can only rate a COMPLETED ride');
    }

    /* Only the ride's passenger or driver can rate */
    const isPassenger = ride.passengerId === currentUser.id;
    const isDriver = ride.driverId === currentUser.id;
    const isAdmin = currentUser.role === UserRole.SUPER_ADMIN;

    if (!isPassenger && !isDriver && !isAdmin) {
      throw new ForbiddenException('You are not part of this ride');
    }

    /* UPSERT: one rating row per ride */
    let rating = await this.ratingRepo.findOne({ where: { rideId } });

    if (!rating) {
      rating = this.ratingRepo.create({ rideId });
    }

    /* Passenger rates the driver */
    if (isPassenger || isAdmin) {
      if (dto.passenger_rating != null) rating.passengerRating = dto.passenger_rating;
      if (dto.passenger_comment != null) rating.passengerComment = dto.passenger_comment;
    }

    /* Driver rates the passenger */
    if (isDriver || isAdmin) {
      if (dto.driver_rating != null) rating.driverRating = dto.driver_rating;
      if (dto.driver_comment != null) rating.driverComment = dto.driver_comment;
    }

    await this.ratingRepo.save(rating);

    /* ── Update Driver's rolling average (display only) ──── */
    if (dto.passenger_rating != null && ride.driverId) {
      const driver = await this.driverRepo.findOne({
        where: { userId: ride.driverId },
      });
      if (driver) {
        const newTotal = driver.totalRatings + 1;
        const newAvg =
          (driver.ratingAverage * driver.totalRatings + dto.passenger_rating) / newTotal;
        driver.totalRatings = newTotal;
        driver.ratingAverage = +newAvg.toFixed(2);
        await this.driverRepo.save(driver);
        this.logger.log(
          `Driver ${ride.driverId} rating updated: ${driver.ratingAverage} (${newTotal} ratings)`,
        );
      }
    }

    /* ── Update Passenger's rolling average (display only) ──── */
    if (dto.driver_rating != null && ride.passengerId) {
      const passenger = await this.passengerRepo.findOne({
        where: { userId: ride.passengerId },
      });
      if (passenger) {
        const newTotal = passenger.totalRatings + 1;
        const newAvg =
          (passenger.ratingAverage * passenger.totalRatings + dto.driver_rating) / newTotal;
        passenger.totalRatings = newTotal;
        passenger.ratingAverage = +newAvg.toFixed(2);
        await this.passengerRepo.save(passenger);
        this.logger.log(
          `Passenger ${ride.passengerId} rating updated: ${passenger.ratingAverage} (${newTotal} ratings)`,
        );
      }
    }

    return rating;
  }
}
