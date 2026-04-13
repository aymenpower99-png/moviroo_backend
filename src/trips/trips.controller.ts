import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entites/user.entity';

import { Ride } from '../rides/domain/entities/ride.entity';
import { DriverLocation } from '../dispatch/domain/entities/driver-location.entity';

import { StartEnrouteUseCase } from './application/use-cases/start-enroute.use-case';
import { ArrivedUseCase } from './application/use-cases/arrived.use-case';
import { StartTripUseCase } from './application/use-cases/start-trip.use-case';
import { EndTripUseCase } from './application/use-cases/end-trip.use-case';
import { SubmitRatingUseCase } from './application/use-cases/submit-rating.use-case';
import { SubmitRatingDto } from './application/dtos/submit-rating.dto';
import { TripTrackingGateway } from './gateway/trip-tracking.gateway';

@Controller('trips')
export class TripsController {
  private readonly logger = new Logger(TripsController.name);

  constructor(
    private readonly startEnrouteUC: StartEnrouteUseCase,
    private readonly arrivedUC: ArrivedUseCase,
    private readonly startTripUC: StartTripUseCase,
    private readonly endTripUC: EndTripUseCase,
    private readonly submitRatingUC: SubmitRatingUseCase,
    private readonly tripGateway: TripTrackingGateway,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(DriverLocation)
    private readonly locRepo: Repository<DriverLocation>,
  ) {}

  /* ─── STEP 1: Driver starts en-route to pickup ──── */
  @Patch(':rideId/enroute')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async enroute(
    @CurrentUser() user: User,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ) {
    const ride = await this.startEnrouteUC.execute(user.id, rideId);

    this.tripGateway.emitToRide(rideId, 'trip:enroute', {
      rideId,
      driver_eta_min: (ride as any).driverEtaMin ?? null,
      message: 'Driver is on the way',
    });

    return ride;
  }

  /* ─── STEP 3: Driver arrived at pickup ──── */
  @Patch(':rideId/arrived')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async arrived(
    @CurrentUser() user: User,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ) {
    const ride = await this.arrivedUC.execute(user.id, rideId);

    this.tripGateway.emitToRide(rideId, 'trip:driver_arrived', {
      rideId,
      message: 'Driver has arrived at pickup',
      arrived_at: ride.arrivedAt,
    });

    return ride;
  }

  /* ─── STEP 4: Start trip (passenger boarded) ──── */
  @Patch(':rideId/start')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async start(
    @CurrentUser() user: User,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ) {
    const ride = await this.startTripUC.execute(user.id, rideId);

    this.tripGateway.emitToRide(rideId, 'trip:started', {
      rideId,
      trip_started_at: ride.tripStartedAt,
      price_final: ride.priceFinal,
      message: 'Trip has started',
    });

    return ride;
  }

  /* ─── STEP 5: End trip (at destination) ──── */
  @Patch(':rideId/end')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async end(
    @CurrentUser() user: User,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ) {
    /* Flush any remaining GPS buffer before calculating distance */
    await this.tripGateway.flushAll(rideId);

    const ride = await this.endTripUC.execute(user.id, rideId);

    this.tripGateway.emitToRide(rideId, 'trip:completed', {
      rideId,
      distance_km_real: ride.distanceKmReal,
      duration_min_real: ride.durationMinReal,
      price_final: ride.priceFinal,
      loyalty_points_earned: ride.loyaltyPointsEarned,
      message: 'Trip completed',
    });

    /* Send rating prompt after 5-second delay */
    setTimeout(() => {
      this.tripGateway.emitToRide(rideId, 'trip:rate_prompt', {
        rideId,
        message: 'Please rate your trip',
      });
    }, 5000);

    return ride;
  }

  /* ─── STEP 6: Submit rating ──── */
  @Post(':rideId/rate')
  @UseGuards(AuthGuard('jwt'))
  rate(
    @CurrentUser() user: User,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: SubmitRatingDto,
  ) {
    return this.submitRatingUC.execute(user, rideId, dto);
  }

  /* ─── STEP 7: Polling fallback (GET trip status) ──── */
  @Get(':rideId')
  @UseGuards(AuthGuard('jwt'))
  async getTripStatus(
    @CurrentUser() user: User,
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ) {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['vehicleClass', 'passenger', 'driver', 'vehicle'],
    });
    if (!ride) throw new NotFoundException('Ride not found');

    /* Get driver location if assigned */
    let driverLocation: { latitude: number; longitude: number } | null = null;
    if (ride.driverId) {
      const loc = await this.locRepo.findOne({
        where: { driverId: ride.driverId },
      });
      if (loc) {
        driverLocation = { latitude: loc.latitude, longitude: loc.longitude };
      }
    }

    return {
      id: ride.id,
      status: ride.status,
      driver_location: driverLocation,
      pickup: {
        address: ride.pickupAddress,
        lat: ride.pickupLat,
        lon: ride.pickupLon,
      },
      dropoff: {
        address: ride.dropoffAddress,
        lat: ride.dropoffLat,
        lon: ride.dropoffLon,
      },
      price_final: ride.priceFinal,
      distance_km: ride.distanceKm,
      duration_min: ride.durationMin,
      distance_km_real: ride.distanceKmReal,
      duration_min_real: ride.durationMinReal,
      loyalty_points_earned: ride.loyaltyPointsEarned,
      enroute_at: ride.enrouteAt,
      arrived_at: ride.arrivedAt,
      trip_started_at: ride.tripStartedAt,
      completed_at: ride.completedAt,
    };
  }
}
