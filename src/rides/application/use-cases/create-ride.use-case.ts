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

    /* 3 ── Verify vehicle class (if provided) ─────────────── */
    let vehicleClass: VehicleClass | null = null;
    if (dto.class_id) {
      vehicleClass = await this.classRepo.findOne({
        where: { id: dto.class_id },
      });
      if (!vehicleClass) {
        this.logger.error(`[BOOKING] Vehicle class not found: ${dto.class_id}`);
        throw new NotFoundException(`Vehicle class ${dto.class_id} not found`);
      }
      this.logger.log(`[BOOKING] Vehicle class verified: ${vehicleClass.name}`);
    } else {
      this.logger.log(
        `[BOOKING] No vehicle class provided - will be set during confirmation`,
      );
    }

    /* 4 ── Validate coordinates ───────────────────── */
    this.validateCoordinates(dto);

    /* 5 ── Validate datetime ───────────────────── */
    this.validateDatetime(dto);

    /* 6 ── Validate coordinates are in service area ──── */
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

    /* 6 ── Get price estimate from ML API (if class provided) ──── */
    let pricingResult;
    if (vehicleClass) {
      const pricingStart = Date.now();
      this.logger.log(
        `[BOOKING] Fetching price estimate for ${vehicleClass.name}`,
      );
      pricingResult = await this.pricing.estimate({
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
    } else {
      this.logger.log(`[BOOKING] No vehicle class - skipping pricing estimate`);
      pricingResult = {
        finalPrice: 0,
        exactPrice: 0,
        loyaltyPoints: 0,
        surgeMultiplier: 1.0,
        distanceKm: 0,
        durationMin: 0,
        fullResponse: { skipped: true, reason: 'No vehicle class provided' },
      };
    }

    /* 7 ── Use display names from DTO or generate fallback ─────── */
    const pickupAddress =
      dto.pickup_address ||
      this.generateFallbackAddress(pickupLat, pickupLon, 'Pickup');
    const dropoffAddress =
      dto.dropoff_address ||
      this.generateFallbackAddress(dropoffLat, dropoffLon, 'Dropoff');

    this.logger.log(`[BOOKING] Using pickup address: "${pickupAddress}"`);
    this.logger.log(`[BOOKING] Using dropoff address: "${dropoffAddress}"`);

    /* 8 ── Persist ride ─────────────────────── */
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
      `[BOOKING] Ride ${saved.id} created successfully - passenger=${passengerId} class=${vehicleClass?.name ?? 'pending'} price=${pricingResult.finalPrice} TND surge=${pricingResult.surgeMultiplier} loyalty=${pricingResult.loyaltyPoints} - ${totalDuration}ms total`,
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

  /** Validate that coordinates are present and valid */
  private validateCoordinates(dto: CreateRideDto): void {
    const errors: string[] = [];

    // Check pickup coordinates
    if (dto.pickup_lat === null || dto.pickup_lat === undefined) {
      errors.push('pickup_lat is required');
    } else if (isNaN(dto.pickup_lat)) {
      errors.push('pickup_lat must be a valid number');
    } else if (dto.pickup_lat < -90 || dto.pickup_lat > 90) {
      errors.push('pickup_lat must be between -90 and 90');
    }

    if (dto.pickup_lon === null || dto.pickup_lon === undefined) {
      errors.push('pickup_lon is required');
    } else if (isNaN(dto.pickup_lon)) {
      errors.push('pickup_lon must be a valid number');
    } else if (dto.pickup_lon < -180 || dto.pickup_lon > 180) {
      errors.push('pickup_lon must be between -180 and 180');
    }

    // Check dropoff coordinates
    if (dto.dropoff_lat === null || dto.dropoff_lat === undefined) {
      errors.push('dropoff_lat is required');
    } else if (isNaN(dto.dropoff_lat)) {
      errors.push('dropoff_lat must be a valid number');
    } else if (dto.dropoff_lat < -90 || dto.dropoff_lat > 90) {
      errors.push('dropoff_lat must be between -90 and 90');
    }

    if (dto.dropoff_lon === null || dto.dropoff_lon === undefined) {
      errors.push('dropoff_lon is required');
    } else if (isNaN(dto.dropoff_lon)) {
      errors.push('dropoff_lon must be a valid number');
    } else if (dto.dropoff_lon < -180 || dto.dropoff_lon > 180) {
      errors.push('dropoff_lon must be between -180 and 180');
    }

    if (errors.length > 0) {
      this.logger.error(
        `[BOOKING] Coordinate validation failed: ${errors.join(', ')}`,
      );
      throw new BadRequestException(
        `Invalid coordinates: ${errors.join(', ')}`,
      );
    }

    this.logger.log(`[BOOKING] Coordinates validated successfully`);
  }

  /** Validate that datetime is present and valid */
  private validateDatetime(dto: CreateRideDto): void {
    if (!dto.scheduled_at) {
      this.logger.error(`[BOOKING] Datetime is required`);
      throw new BadRequestException('Datetime is required for booking');
    }

    const scheduledDate = new Date(dto.scheduled_at);
    const now = new Date();

    // Check if datetime is valid
    if (isNaN(scheduledDate.getTime())) {
      this.logger.error(
        `[BOOKING] Invalid datetime format: ${dto.scheduled_at}`,
      );
      throw new BadRequestException('Invalid datetime format');
    }

    // Check if datetime is in the past
    if (scheduledDate < now) {
      this.logger.error(
        `[BOOKING] Datetime is in the past: ${dto.scheduled_at}`,
      );
      throw new BadRequestException('Datetime cannot be in the past');
    }

    // Check if datetime is too far in the future (max 30 days)
    const maxFutureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (scheduledDate > maxFutureDate) {
      this.logger.error(
        `[BOOKING] Datetime is too far in the future: ${dto.scheduled_at}`,
      );
      throw new BadRequestException(
        'Datetime cannot be more than 30 days in the future',
      );
    }

    this.logger.log(
      `[BOOKING] Datetime validated successfully: ${dto.scheduled_at}`,
    );
  }

  /** Generate fallback address from coordinates when display name is not provided */
  private generateFallbackAddress(
    lat: number,
    lon: number,
    locationType: string,
  ): string {
    return `${locationType} Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
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
