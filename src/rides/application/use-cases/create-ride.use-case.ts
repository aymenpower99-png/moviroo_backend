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
    const startTime = Date.now();
    this.logger.log(
      `[BOOKING] Create ride request: passenger=${currentUser.id} class_id=${dto.class_id}`,
    );

    /* 1 ── Determine passenger ──────────────── */
    const passengerId = this.resolvePassengerId(currentUser, dto);
    this.logger.log(`[BOOKING] Resolved passenger: ${passengerId}`);

    /* 2 ── Verify passenger profile exists ───── */
    const passenger = await this.passengerRepo.findOne({
      where: { userId: passengerId },
    });
    if (!passenger) {
      this.logger.error(
        `[BOOKING] Passenger profile not found for user: ${passengerId}`,
      );
      throw new NotFoundException('Passenger profile not found for this user');
    }

    /* 3 ── Verify vehicle class ─────────────── */
    const vehicleClass = await this.classRepo.findOne({
      where: { id: dto.class_id },
    });
    if (!vehicleClass) {
      this.logger.error(`[BOOKING] Vehicle class not found: ${dto.class_id}`);
      throw new NotFoundException(`Vehicle class ${dto.class_id} not found`);
    }
    this.logger.log(`[BOOKING] Vehicle class verified: ${vehicleClass.name}`);

    /* 4 ── Validate coordinates and re-geocode for display names ──── */
    const geocodeStart = Date.now();
    const pickupLat = dto.pickup_lat;
    const pickupLon = dto.pickup_lon;
    const dropoffLat = dto.dropoff_lat;
    const dropoffLon = dto.dropoff_lon;

    // Validate service area (Tunisia bounding box)
    if (!this.isInServiceArea(pickupLat, pickupLon)) {
      this.logger.warn(
        `[BOOKING] Pickup outside service area: (${pickupLat}, ${pickupLon})`,
      );
      throw new BadRequestException(
        'Pickup location is outside the service area (Tunisia)',
      );
    }
    if (!this.isInServiceArea(dropoffLat, dropoffLon)) {
      this.logger.warn(
        `[BOOKING] Dropoff outside service area: (${dropoffLat}, ${dropoffLon})`,
      );
      throw new BadRequestException(
        'Dropoff location is outside the service area (Tunisia)',
      );
    }

    // GPS validation for suspicious locations
    const pickupSuspicious = this.isSuspiciousLocation(pickupLat, pickupLon);
    if (pickupSuspicious.suspicious) {
      this.logger.warn(
        `[BOOKING] Suspicious pickup location: (${pickupLat}, ${pickupLon}) - ${pickupSuspicious.reason}`,
      );
      throw new BadRequestException(
        `Pickup location appears invalid: ${pickupSuspicious.reason}`,
      );
    }

    const dropoffSuspicious = this.isSuspiciousLocation(dropoffLat, dropoffLon);
    if (dropoffSuspicious.suspicious) {
      this.logger.warn(
        `[BOOKING] Suspicious dropoff location: (${dropoffLat}, ${dropoffLon}) - ${dropoffSuspicious.reason}`,
      );
      throw new BadRequestException(
        `Dropoff location appears invalid: ${dropoffSuspicious.reason}`,
      );
    }

    // Re-geocode coordinates to get display names (backend validation)
    this.logger.log(`[BOOKING] Re-geocoding pickup and dropoff locations`);
    const pickupGeo = await this.geocoding.reverse(pickupLat, pickupLon);
    const dropoffGeo = await this.geocoding.reverse(dropoffLat, dropoffLon);
    const geocodeDuration = Date.now() - geocodeStart;

    if (!pickupGeo) {
      this.logger.error(
        `[BOOKING] Could not validate pickup location: (${pickupLat}, ${pickupLon})`,
      );
      throw new BadRequestException(
        'Could not validate pickup location via reverse geocoding',
      );
    }
    if (!dropoffGeo) {
      this.logger.error(
        `[BOOKING] Could not validate dropoff location: (${dropoffLat}, ${dropoffLon})`,
      );
      throw new BadRequestException(
        'Could not validate dropoff location via reverse geocoding',
      );
    }

    // Use backend-validated addresses
    const pickupAddress = pickupGeo.display_name;
    const dropoffAddress = dropoffGeo.display_name;

    this.logger.log(
      `[BOOKING] Re-geocoded pickup: (${pickupLat}, ${pickupLon}) → "${pickupAddress}"`,
    );
    this.logger.log(
      `[BOOKING] Re-geocoded dropoff: (${dropoffLat}, ${dropoffLon}) → "${dropoffAddress}" - ${geocodeDuration}ms`,
    );

    /* 5 ── Get price estimate from ML API ──── */
    const pricingStart = Date.now();
    this.logger.log(
      `[BOOKING] Fetching price estimate for ${vehicleClass.name}`,
    );
    const pricingResult = await this.pricing.estimate({
      pickupLat,
      pickupLon,
      dropoffLat,
      dropoffLon,
      carType: vehicleClass.name.toLowerCase().replace(/\s+/g, '_'),
      bookingDt: dto.scheduled_at,
    });
    const pricingDuration = Date.now() - pricingStart;
    this.logger.log(
      `[BOOKING] Price estimate received: ${pricingResult.finalPrice} TND - ${pricingDuration}ms`,
    );

    /* 6 ── Persist ride ─────────────────────── */
    const isAdminCreated = currentUser.role === UserRole.SUPER_ADMIN;

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
      paymentMethod: isAdminCreated ? 'CASH' : null,
    });

    const saved = await this.rideRepo.save(ride);
    const totalDuration = Date.now() - startTime;

    this.logger.log(
      `[BOOKING] Ride ${saved.id} created successfully - passenger=${passengerId} class=${vehicleClass.name} price=${pricingResult.finalPrice} TND surge=${pricingResult.surgeMultiplier} loyalty=${pricingResult.loyaltyPoints} - ${totalDuration}ms total`,
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

  /** Check if coordinates are within Tunisia's service area (bounding box) */
  private isInServiceArea(lat: number, lon: number): boolean {
    // Tunisia bounding box: lat 30.2-37.5, lon 7.5-11.6
    return lat >= 30.2 && lat <= 37.5 && lon >= 7.5 && lon <= 11.6;
  }

  /** Detect if coordinates are suspicious (ocean, invalid, or manipulated) */
  private isSuspiciousLocation(
    lat: number,
    lon: number,
  ): { suspicious: boolean; reason?: string } {
    // Check for ocean coordinates using a simple heuristic
    // Tunisia is landlocked within Mediterranean, coordinates should be valid land

    // Check if coordinates are exactly at origin (suspicious default)
    if (lat === 0 && lon === 0) {
      return { suspicious: true, reason: 'Coordinates at origin (0,0)' };
    }

    // Check for invalid latitude ranges
    if (lat < -90 || lat > 90) {
      return { suspicious: true, reason: 'Invalid latitude range' };
    }

    // Check for invalid longitude ranges
    if (lon < -180 || lon > 180) {
      return { suspicious: true, reason: 'Invalid longitude range' };
    }

    // Check for coordinates with excessive precision (possible GPS spoofing)
    // Normal GPS has ~6 decimal places (1m precision), 10+ decimal places is suspicious
    const latStr = lat.toString();
    const lonStr = lon.toString();
    const latDecimals = latStr.includes('.') ? latStr.split('.')[1].length : 0;
    const lonDecimals = lonStr.includes('.') ? lonStr.split('.')[1].length : 0;

    if (latDecimals > 8 || lonDecimals > 8) {
      return {
        suspicious: true,
        reason: 'Excessive coordinate precision (possible spoofing)',
      };
    }

    // Check for coordinates outside reasonable bounds for Tunisia
    // While isInServiceArea checks exact bounds, this checks for obviously wrong coordinates
    if (lat < 25 || lat > 40 || lon < 5 || lon > 15) {
      return {
        suspicious: true,
        reason: 'Coordinates outside reasonable Tunisia region',
      };
    }

    // Check if coordinates are in ocean (simplified check for Mediterranean)
    // Tunisia's coastline is roughly at these coordinates
    // This is a basic heuristic - in production, use a proper ocean mask
    const oceanZones = [
      { latRange: [33, 38], lonRange: [8, 13] }, // Mediterranean near Tunisia
    ];

    for (const zone of oceanZones) {
      if (
        lat >= zone.latRange[0] &&
        lat <= zone.latRange[1] &&
        lon >= zone.lonRange[0] &&
        lon <= zone.lonRange[1]
      ) {
        // This is a very rough approximation - in production use proper GIS data
        // For now, we'll flag it as potentially suspicious but not block
        this.logger.warn(
          `[BOOKING] Coordinates in potential ocean zone: (${lat}, ${lon})`,
        );
      }
    }

    return { suspicious: false };
  }
}
