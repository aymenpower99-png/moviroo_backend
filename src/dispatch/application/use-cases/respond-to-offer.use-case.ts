import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DispatchOffer } from '../../domain/entities/dispatch-offer.entity';
import { OfferStatus } from '../../domain/enums/offer-status.enum';
import { Ride } from '../../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../../rides/domain/enums/ride-status.enum';
import { DriverLocation } from '../../domain/entities/driver-location.entity';
import { Driver } from '../../../driver/entities/driver.entity';
import { Vehicle } from '../../../vehicles/entities/vehicle.entity';
import { User } from '../../../users/entites/user.entity';

@Injectable()
export class RespondToOfferUseCase {
  private readonly logger = new Logger(RespondToOfferUseCase.name);

  constructor(
    @InjectRepository(DispatchOffer)
    private readonly offerRepo: Repository<DispatchOffer>,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(DriverLocation)
    private readonly locRepo: Repository<DriverLocation>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
  ) {}

  /**
   * Driver accepts an offer:
   *  1. Mark offer ACCEPTED (atomic — only if still PENDING)
   *  2. Set ride: status=ASSIGNED, driver_id, vehicle_id
   *  3. Set driver_locations: is_on_trip=true
   */
  async accept(currentUser: User, offerId: string): Promise<Ride> {
    const offer = await this.offerRepo.findOne({
      where: { id: offerId },
    });
    if (!offer) throw new NotFoundException('Offer not found');

    // Only the offered driver can accept
    if (offer.driverId !== currentUser.id) {
      throw new ForbiddenException('This offer is not for you');
    }

    // Atomic update: only accept if still PENDING (prevents race with timeout)
    const result = await this.offerRepo.update(
      { id: offerId, status: OfferStatus.PENDING },
      { status: OfferStatus.ACCEPTED },
    );
    if (result.affected === 0) {
      throw new ConflictException('Offer already expired or responded to');
    }

    // Find driver record → vehicle
    const driver = await this.driverRepo.findOne({
      where: { userId: currentUser.id },
    });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const vehicle = await this.vehicleRepo.findOne({
      where: { driverId: driver.id },
    });
    if (!vehicle) throw new NotFoundException('No vehicle assigned to driver');

    // Update ride → ASSIGNED
    const ride = await this.rideRepo.findOne({ where: { id: offer.rideId } });
    if (!ride) throw new NotFoundException('Ride not found');

    ride.status = RideStatus.ASSIGNED;
    ride.driverId = currentUser.id;
    ride.vehicleId = vehicle.id;
    await this.rideRepo.save(ride);

    // Mark driver as on trip
    await this.locRepo.update(
      { driverId: currentUser.id },
      { isOnTrip: true },
    );

    this.logger.log(
      `✅ Ride ${ride.id} ASSIGNED → driver=${currentUser.id} vehicle=${vehicle.id}`,
    );

    return this.rideRepo.findOne({
      where: { id: ride.id },
      relations: ['passenger', 'driver', 'vehicle', 'vehicleClass'],
    }) as Promise<Ride>;
  }

  /**
   * Driver rejects an offer (with optional reason).
   * The dispatch loop continues to the next driver.
   */
  async reject(
    currentUser: User,
    offerId: string,
    reason?: string,
  ): Promise<{ message: string }> {
    const offer = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');

    if (offer.driverId !== currentUser.id) {
      throw new ForbiddenException('This offer is not for you');
    }

    const result = await this.offerRepo.update(
      { id: offerId, status: OfferStatus.PENDING },
      { status: OfferStatus.REJECTED, rejectionReason: reason ?? null },
    );
    if (result.affected === 0) {
      throw new ConflictException('Offer already expired or responded to');
    }

    this.logger.log(`❌ Driver ${currentUser.id} rejected offer ${offerId}`);
    return { message: 'Offer rejected' };
  }
}
