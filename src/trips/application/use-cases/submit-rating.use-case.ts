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
import { TripTrackingGateway } from '../../gateway/trip-tracking.gateway';

export interface RatingResult {
  rating: RideRating;
  driverRating?: {
    average: number;
    totalRatings: number;
  };
  passengerRating?: {
    average: number;
    totalRatings: number;
  };
}

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
    private readonly tripGateway: TripTrackingGateway,
  ) {}

  async execute(
    currentUser: User,
    rideId: string,
    dto: SubmitRatingDto,
  ): Promise<RatingResult> {
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

    /* ── Duplicate rating guard ───────────────────────────────────────────
       A passenger may only submit passenger_rating once per trip.
       A driver may only submit driver_rating once per trip.
       Admins can overwrite (bypass guard). ──────────────────────────────── */
    if (isPassenger && !isAdmin) {
      if (dto.passenger_rating != null && rating.passengerRating != null) {
        throw new ConflictException(
          'You have already rated this driver for this trip',
        );
      }
    }
    if (isDriver && !isAdmin) {
      if (dto.driver_rating != null && rating.driverRating != null) {
        throw new ConflictException(
          'You have already rated this passenger for this trip',
        );
      }
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

    const result: RatingResult = { rating };

    /* ── Update Driver's rolling average ──────────────────────────────────── */
    if (dto.passenger_rating != null && ride.driverId) {
      const driver = await this.driverRepo.findOne({
        where: { userId: ride.driverId },
      });
      if (driver) {
        const oldTotal = driver.totalRatings;
        const oldAvg = driver.ratingAverage;
        const newTotal = oldTotal + 1;
        const newAvg = (oldAvg * oldTotal + dto.passenger_rating) / newTotal;

        driver.totalRatings = newTotal;
        driver.ratingAverage = +newAvg.toFixed(2);
        await this.driverRepo.save(driver);

        result.driverRating = {
          average: driver.ratingAverage,
          totalRatings: driver.totalRatings,
        };

        this.logger.log(
          `Driver ${ride.driverId} rating updated: ${driver.ratingAverage} (${driver.totalRatings} ratings)`,
        );
      }
    }

    /* ── Update Passenger's rolling average ───────────────────────────────── */
    if (dto.driver_rating != null && ride.passengerId) {
      const passenger = await this.passengerRepo.findOne({
        where: { userId: ride.passengerId },
      });
      if (passenger) {
        const oldTotal = passenger.totalRatings;
        const oldAvg = passenger.ratingAverage;
        const newTotal = oldTotal + 1;
        const newAvg = (oldAvg * oldTotal + dto.driver_rating) / newTotal;

        passenger.totalRatings = newTotal;
        passenger.ratingAverage = +newAvg.toFixed(2);
        await this.passengerRepo.save(passenger);

        result.passengerRating = {
          average: passenger.ratingAverage,
          totalRatings: passenger.totalRatings,
        };

        this.logger.log(
          `Passenger ${ride.passengerId} rating updated: ${passenger.ratingAverage} (${passenger.totalRatings} ratings)`,
        );
      }
    }

    /* ── Push real-time update to both parties ──────────────────────────── */
    this.tripGateway.emitToRide(rideId, 'trip:rating_updated', {
      rideId,
      driverRating: result.driverRating,
      passengerRating: result.passengerRating,
    });

    return result;
  }
}
