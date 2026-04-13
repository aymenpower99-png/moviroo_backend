import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Ride } from '../../domain/entities/ride.entity';
import { RideStatus } from '../../domain/enums/ride-status.enum';
import { User, UserRole } from '../../../users/entites/user.entity';
import { PassengerEntity } from '../../../passenger/entities/passengers.entity';
import { VehicleClass } from '../../../classes/entities/class.entity';
import { GeocodingService } from '../../infrastructure/services/geocoding.service';
import { PricingService } from '../../infrastructure/services/pricing.service';
import { CreateRideDto } from '../dtos/create-ride.dto';

@Injectable()
export class CreateRideUseCase {
  private readonly logger = new Logger(CreateRideUseCase.name);

  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(PassengerEntity)
    private readonly passengerRepo: Repository<PassengerEntity>,
    @InjectRepository(VehicleClass)
    private readonly classRepo: Repository<VehicleClass>,
    private readonly geocoding: GeocodingService,
    private readonly pricing: PricingService,
  ) {}

  async execute(currentUser: User, dto: CreateRideDto): Promise<Ride> {
    /* 1 ── Determine passenger ──────────────── */
    const passengerId = this.resolvePassengerId(currentUser, dto);

    /* 2 ── Verify passenger profile exists ───── */
    const passenger = await this.passengerRepo.findOne({
      where: { userId: passengerId },
    });
    if (!passenger) {
      throw new NotFoundException(
        'Passenger profile not found for this user',
      );
    }

    /* 3 ── Verify vehicle class ─────────────── */
    const vehicleClass = await this.classRepo.findOne({
      where: { id: dto.class_id },
    });
    if (!vehicleClass) {
      throw new NotFoundException(
        `Vehicle class ${dto.class_id} not found`,
      );
    }

    /* 4 ── Resolve coordinates / addresses ──── */
    let pickupLat = dto.pickup_lat;
    let pickupLon = dto.pickup_lon;
    let dropoffLat = dto.dropoff_lat;
    let dropoffLon = dto.dropoff_lon;
    const pickupAddress = dto.pickup_address;
    const dropoffAddress = dto.dropoff_address;

    if (pickupLat == null || pickupLon == null) {
      const geo = await this.geocoding.forward(pickupAddress);
      if (!geo) {
        throw new BadRequestException(
          'Could not geocode pickup address',
        );
      }
      pickupLat = geo.lat;
      pickupLon = geo.lon;
    }

    if (dropoffLat == null || dropoffLon == null) {
      const geo = await this.geocoding.forward(dropoffAddress);
      if (!geo) {
        throw new BadRequestException(
          'Could not geocode dropoff address',
        );
      }
      dropoffLat = geo.lat;
      dropoffLon = geo.lon;
    }

    /* 5 ── Get price estimate from ML API ──── */
    const pricingResult = await this.pricing.estimate({
      pickupLat,
      pickupLon,
      dropoffLat,
      dropoffLon,
      carType: vehicleClass.name.toLowerCase().replace(/\s+/g, '_'),
      bookingDt: dto.scheduled_at,
    });

    /* 6 ── Persist ride ─────────────────────── */
    const ride = this.rideRepo.create({
      passengerId,
      classId: dto.class_id,
      status: RideStatus.PENDING,
      pickupAddress,
      pickupLat,
      pickupLon,
      dropoffAddress,
      dropoffLat,
      dropoffLon,
      distanceKm: pricingResult.distanceKm,
      durationMin: pricingResult.durationMin,
      priceEstimate: pricingResult.exactPrice,
      priceFinal: pricingResult.finalPrice,
      surgeMultiplier: pricingResult.surgeMultiplier,
      loyaltyPointsEarned: pricingResult.loyaltyPoints,
      pricingSnapshot: pricingResult.fullResponse,
      scheduledAt: new Date(dto.scheduled_at),
    });

    const saved = await this.rideRepo.save(ride);

    this.logger.log(
      `Ride ${saved.id} created — passenger=${passengerId} class=${vehicleClass.name} est=${pricingResult.finalPrice} TND`,
    );

    return this.rideRepo.findOne({
      where: { id: saved.id },
      relations: ['passenger', 'vehicleClass'],
    }) as Promise<Ride>;
  }

  private resolvePassengerId(user: User, dto: CreateRideDto): string {
    if (user.role === UserRole.SUPER_ADMIN) {
      if (!dto.passenger_id) {
        throw new BadRequestException(
          'Admin must provide passenger_id when creating a ride',
        );
      }
      return dto.passenger_id;
    }
    return user.id;
  }
}
