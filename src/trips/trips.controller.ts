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
  ForbiddenException,
  ConflictException,
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
import { RideStatus } from '../rides/domain/enums/ride-status.enum';
import { DriverLocation } from '../dispatch/domain/entities/driver-location.entity';
import {
  Driver,
  DriverAvailabilityStatus,
} from '../driver/entities/driver.entity';
import { TripPayment } from '../billing/entities/trip-payment.entity';
import { PaymentService } from '../billing/services/payment.service';

import { StartEnrouteUseCase } from './application/use-cases/start-enroute.use-case';
import { ArrivedUseCase } from './application/use-cases/arrived.use-case';
import { StartTripUseCase } from './application/use-cases/start-trip.use-case';
import { EndTripUseCase } from './application/use-cases/end-trip.use-case';
import { SubmitRatingUseCase } from './application/use-cases/submit-rating.use-case';
import { SubmitRatingDto } from './application/dtos/submit-rating.dto';
import { TripTrackingGateway } from './gateway/trip-tracking.gateway';
import { DriverNotificationService } from '../notifications/services/driver-notification.service';
import { PassengerNotificationService } from '../notifications/services/passenger-notification.service';
import { RideMailService } from '../mail/services/ride-mail.service';
import { RoutingService } from '../rides/infrastructure/services/routing/routing.service';

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
    private readonly routingService: RoutingService,
    private readonly rideMail: RideMailService,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(DriverLocation)
    private readonly locRepo: Repository<DriverLocation>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(TripPayment)
    private readonly paymentRepo: Repository<TripPayment>,
    private readonly paymentService: PaymentService,
    private readonly driverNotif: DriverNotificationService,
    private readonly passengerNotif: PassengerNotificationService,
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

    // Push notification to driver
    this.driverNotif.rideStatusChanged(
      user.id,
      rideId,
      RideStatus.EN_ROUTE_TO_PICKUP,
    );

    // Push notification to passenger
    if (ride.passengerId) {
      this.passengerNotif.rideStatusChanged(
        ride.passengerId,
        rideId,
        RideStatus.EN_ROUTE_TO_PICKUP,
      );
    }

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

    this.driverNotif.rideStatusChanged(user.id, rideId, RideStatus.ARRIVED);

    // Push notification to passenger
    if (ride.passengerId) {
      this.passengerNotif.rideStatusChanged(
        ride.passengerId,
        rideId,
        RideStatus.ARRIVED,
      );
    }

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

    this.driverNotif.rideStatusChanged(user.id, rideId, RideStatus.IN_TRIP);

    // Push notification to passenger
    if (ride.passengerId) {
      this.passengerNotif.rideStatusChanged(
        ride.passengerId,
        rideId,
        RideStatus.IN_TRIP,
      );
    }

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

    this.driverNotif.rideStatusChanged(user.id, rideId, RideStatus.COMPLETED);

    // Push notification to passenger
    if (ride.passengerId) {
      this.passengerNotif.rideStatusChanged(
        ride.passengerId,
        rideId,
        RideStatus.COMPLETED,
      );
    }

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

  /* ─── Driver cancel (with reason + cancellation count) ──── */
  @Patch(':rideId/cancel')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async driverCancel(
    @CurrentUser() user: User,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() body: { reason?: string },
  ) {
    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.driverId !== user.id)
      throw new ForbiddenException('Not assigned to this ride');

    const cancellable: RideStatus[] = [
      RideStatus.ASSIGNED,
      RideStatus.EN_ROUTE_TO_PICKUP,
      RideStatus.ARRIVED,
    ];
    if (!cancellable.includes(ride.status)) {
      throw new ConflictException(
        `Cannot cancel a ride in ${ride.status} status`,
      );
    }

    ride.status = RideStatus.CANCELLED;
    ride.cancelledAt = new Date();
    ride.cancellationReason = body?.reason ?? null;
    await this.rideRepo.save(ride);

    // Clean up payment record (cash → delete; card + paid → refund; card + pending → delete)
    this.paymentService.cancelPaymentForRide(rideId).catch((err) => {
      this.logger.error(`[DriverCancel] Payment cleanup failed for ride ${rideId}: ${err}`);
    });

    // Free driver: reset availabilityStatus so they can receive next dispatch
    await this.driverRepo.update(
      { userId: user.id },
      { availabilityStatus: DriverAvailabilityStatus.ONLINE },
    );

    this.tripGateway.emitToRide(rideId, 'trip:cancelled', {
      rideId,
      cancelledBy: 'driver',
      reason: body?.reason ?? null,
      message: 'Ride cancelled by driver',
    });

    // Push notification to driver confirming cancellation
    this.driverNotif.rideCancelledByDriver(user.id, rideId);

    // Push notification to passenger
    if (ride.passengerId) {
      this.logger.log(
        `[Trips] Driver cancelled ride ${rideId}, notifying passenger ${ride.passengerId.slice(0, 8)}`,
      );
      const payment = await this.paymentRepo.findOne({
        where: { rideId: rideId },
      });
      this.logger.log(
        `[Trips] Payment lookup for ride ${rideId}: method=${payment?.paymentMethod ?? 'NOT_FOUND'}`,
      );
      this.passengerNotif.rideCancelledByDriver(
        ride.passengerId,
        rideId,
        payment?.paymentMethod ?? undefined,
      );
    } else {
      this.logger.warn(
        `[Trips] Ride ${rideId} has no passengerId, cannot notify passenger`,
      );
    }

    // Send cancellation + refund email to passenger
    try {
      const rideWithPassenger = await this.rideRepo.findOne({
        where: { id: rideId },
        relations: ['passenger'],
      });
      const payment = await this.paymentRepo.findOne({
        where: { rideId: rideId },
      });
      if (rideWithPassenger?.passenger?.email) {
        await this.rideMail.sendRideCancelledRefundEmail(
          rideWithPassenger.passenger.email,
          rideWithPassenger.passenger.firstName || 'Passenger',
          rideWithPassenger,
          'DRIVER',
          payment?.paymentMethod,
          body?.reason ?? null,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to send cancellation email for ride ${rideId}: ${err}`,
      );
    }

    return ride;
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
    let driverLocation: {
      latitude: number;
      longitude: number;
      last_updated_at: Date;
    } | null = null;
    let progress: number | null = null;
    let etaMins: number | null = null;
    let remainingDistanceMeters: number | null = null;

    if (ride.driverId) {
      const loc = await this.locRepo.findOne({
        where: { driverId: ride.driverId },
      });
      if (loc) {
        driverLocation = {
          latitude: loc.latitude,
          longitude: loc.longitude,
          last_updated_at: loc.lastSeenAt,
        };
        progress = loc.progress ?? null;

        /* Compute ETA dynamically using RoutingService (same logic as WebSocket) */
        const targetLat =
          ride.status === 'IN_TRIP' ? ride.dropoffLat : ride.pickupLat;
        const targetLon =
          ride.status === 'IN_TRIP' ? ride.dropoffLon : ride.pickupLon;
        const totalDistanceMeters = ride.distanceKm
          ? ride.distanceKm * 1000
          : 0;

        if (totalDistanceMeters > 0) {
          try {
            const progressData =
              await this.routingService.calculateProgressForRide(
                loc.latitude,
                loc.longitude,
                targetLat,
                targetLon,
                totalDistanceMeters,
                loc.speedKmh ?? 0,
              );

            /* Override with FRESH computed values (not stale DB snapshot) */
            if (progressData) {
              progress = progressData.progress;
              etaMins = progressData.etaMins;
              remainingDistanceMeters = progressData.remainingDistanceMeters;
            }
          } catch (err) {
            this.logger.error(
              `Failed to calculate progress for ride ${rideId}: ${err}`,
            );
          }
        }
      }
    }

    return {
      id: ride.id,
      status: ride.status,
      driver_location: driverLocation,
      progress: progress,
      etaMins: etaMins,
      remainingDistanceMeters: remainingDistanceMeters,
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
