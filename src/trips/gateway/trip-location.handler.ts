import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { TripWaypoint } from '../domain/entities/trip-waypoint.entity';
import { DriverLocation } from '../../dispatch/domain/entities/driver-location.entity';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { RoutingService } from '../../rides/infrastructure/services/routing/routing.service';
import { RouteHistoryRepository } from '../../rides/infrastructure/repositories/route-history.repository';
import { TripReroutingHandler } from './trip-rerouting.handler';
import { TripBufferHandler } from './trip-buffer.handler';
import { GpsPayload } from './trip-gateway.types';

/**
 * Handler for GPS location updates and progress calculation
 */
export class TripLocationHandler {
  private readonly logger = new Logger(TripLocationHandler.name);
  private static readonly FLUSH_THRESHOLD = 5;
  private static readonly PROGRESS_CACHE_TTL = 5000; // 5 seconds

  constructor(
    private readonly rideRepo: Repository<Ride>,
    private readonly locRepo: Repository<DriverLocation>,
    private readonly routingService: RoutingService,
    private readonly routeHistoryRepo: RouteHistoryRepository,
    private readonly reroutingHandler: TripReroutingHandler,
    private readonly bufferHandler: TripBufferHandler,
    private readonly gpsBuffer: Map<string, Partial<TripWaypoint>[]>,
    private readonly sequenceCounters: Map<string, number>,
    private readonly progressCache: Map<string, { data: any; timestamp: number }>,
    private readonly server: Server,
  ) {}

  /**
   * Handle GPS location updates from driver
   */
  async handleGps(client: Socket, payload: GpsPayload): Promise<{ event: string; data: any }> {
    this.logger.log(
      `GPS received from client ${client.id}: ride_id=${payload.ride_id}, lat=${payload.latitude}, lng=${payload.longitude}`,
    );

    if (
      !payload?.ride_id ||
      payload.latitude == null ||
      payload.longitude == null
    ) {
      this.logger.warn(`Invalid GPS payload: ${JSON.stringify(payload)}`);
      return { event: 'error', data: { message: 'Invalid GPS payload' } };
    }

    const rideId = payload.ride_id;

    // Validate ride status - only accept GPS for active trips
    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) {
      this.logger.warn(`Ride ${rideId} not found - rejecting GPS`);
      return { event: 'error', data: { message: 'Ride not found' } };
    }

    const activeTripStatuses = [
      'ASSIGNED',
      'EN_ROUTE_TO_PICKUP',
      'ARRIVED',
      'IN_TRIP',
    ];
    if (!activeTripStatuses.includes(ride.status)) {
      this.logger.warn(
        `Ride ${rideId} status is ${ride.status} (not an active trip) - rejecting GPS and waypoint insertion`,
      );
      // Still update driver_location for real-time tracking, but don't insert waypoints
      try {
        await this.locRepo
          .createQueryBuilder()
          .update(DriverLocation)
          .set({
            latitude: payload.latitude,
            longitude: payload.longitude,
            speedKmh: payload.speed_kmh ?? 0,
            lastSeenAt: new Date(),
          })
          .where(
            `driver_id IN (SELECT driver_id FROM rides WHERE id = :rideId)`,
            { rideId },
          )
          .execute();
      } catch (err) {
        this.logger.error(`Failed to update driver location: ${err}`);
      }
      return {
        event: 'ack',
        data: {
          sequence: 0,
          message: 'Ride not active - GPS logged but waypoints skipped',
        },
      };
    }

    const seq = (this.sequenceCounters.get(rideId) ?? 0) + 1;
    this.sequenceCounters.set(rideId, seq);

    /* Buffer the waypoint */
    const buffer = this.gpsBuffer.get(rideId) ?? [];
    buffer.push({
      rideId,
      latitude: payload.latitude,
      longitude: payload.longitude,
      speedKmh: payload.speed_kmh ?? 0,
      recordedAt: payload.recorded_at
        ? new Date(payload.recorded_at)
        : new Date(),
      sequence: seq,
    });
    this.gpsBuffer.set(rideId, buffer);

    /* Bulk INSERT when buffer reaches threshold */
    if (buffer.length >= TripLocationHandler.FLUSH_THRESHOLD) {
      await this.bufferHandler.flushBuffer(rideId);
    }

    /* Calculate progress with throttling */
    const cachedProgress = this.progressCache.get(rideId);
    const now = Date.now();

    let progressData: any = null;

    // Use cached progress if within TTL, otherwise calculate new
    if (
      cachedProgress &&
      now - cachedProgress.timestamp < TripLocationHandler.PROGRESS_CACHE_TTL
    ) {
      progressData = cachedProgress.data;
      this.logger.log(`[PROGRESS] Using cached progress for ride ${rideId}`);
    } else {
      // Calculate new progress
      try {
        const ride = await this.rideRepo.findOne({ where: { id: rideId } });
        if (ride) {
          // Select route based on ride status using RouteHistory
          let routeGeometry: string | null = null;
          let routeDistanceMeters: number | null = null;
          let routeDurationSeconds: number | null = null;

          if (ride.status === 'EN_ROUTE_TO_PICKUP') {
            // Use pickup route (sequence 1)
            const pickupRoute =
              await this.routeHistoryRepo.findByRideIdAndSequence(rideId, 1);
            if (pickupRoute) {
              routeGeometry = pickupRoute.routeGeometry;
              routeDistanceMeters = pickupRoute.routeDistanceMeters;
              routeDurationSeconds = pickupRoute.routeDurationSeconds;
              this.logger.log(
                `[PROGRESS] Using pickup route from RouteHistory (sequence 1) for EN_ROUTE_TO_PICKUP`,
              );
            }
          } else if (ride.status === 'IN_TRIP') {
            // Use trip route (sequence 2)
            const tripRoute =
              await this.routeHistoryRepo.findByRideIdAndSequence(rideId, 2);
            if (tripRoute) {
              routeGeometry = tripRoute.routeGeometry;
              routeDistanceMeters = tripRoute.routeDistanceMeters;
              routeDurationSeconds = tripRoute.routeDurationSeconds;
              this.logger.log(
                `[PROGRESS] Using trip route from RouteHistory (sequence 2) for IN_TRIP`,
              );
            }
          }

          // Try to use route-based progress if route data is available
          if (routeGeometry && routeDistanceMeters && routeDurationSeconds) {
            this.logger.log(
              `[PROGRESS] Using route-based progress for ride ${rideId}`,
            );
            progressData = this.routingService.calculateProgressRouteBased(
              payload.latitude,
              payload.longitude,
              routeGeometry,
              routeDistanceMeters,
              routeDurationSeconds,
            );

            // Check if driver is off-route and trigger dynamic rerouting
            if (
              progressData &&
              this.reroutingHandler.isOffRoute(
                payload.latitude,
                payload.longitude,
                routeGeometry,
              )
            ) {
              await this.reroutingHandler.handleOffRouteRerouting(
                rideId,
                ride,
                payload.latitude,
                payload.longitude,
              );
            }
          } else {
            // Fallback to old straight-line method if route data is not available
            this.logger.log(
              `[PROGRESS] Using fallback (straight-line) progress for ride ${rideId}`,
            );
            const targetLat =
              ride.status === 'IN_TRIP' ? ride.dropoffLat : ride.pickupLat;
            const targetLon =
              ride.status === 'IN_TRIP' ? ride.dropoffLon : ride.pickupLon;
            const totalDistanceMeters = ride.distanceKm
              ? ride.distanceKm * 1000
              : 0;

            if (totalDistanceMeters > 0) {
              progressData = await this.routingService.calculateProgressForRide(
                payload.latitude,
                payload.longitude,
                targetLat,
                targetLon,
                totalDistanceMeters,
                payload.speed_kmh ?? 0,
              );
            }
          }

          // Cache the result
          if (progressData) {
            this.progressCache.set(rideId, {
              data: progressData,
              timestamp: now,
            });
          }
        }
      } catch (err) {
        this.logger.error(`[PROGRESS] Failed to calculate progress: ${err}`);
      }
    }

    /* Update driver_locations in real-time */
    /* We don't know the driver_id from the socket, so update by ride → driver_id relation */
    try {
      await this.locRepo
        .createQueryBuilder()
        .update(DriverLocation)
        .set({
          latitude: payload.latitude,
          longitude: payload.longitude,
          speedKmh: payload.speed_kmh ?? 0,
          lastSeenAt: new Date(),
          progress: progressData?.progress ?? null,
        })
        .where(
          `driver_id IN (SELECT driver_id FROM rides WHERE id = :rideId)`,
          { rideId },
        )
        .execute();
    } catch (err) {
      this.logger.error(`Failed to update driver location: ${err}`);
    }

    /* Broadcast to the ride room */
    const locationData: any = {
      latitude: payload.latitude,
      longitude: payload.longitude,
      speed_kmh: payload.speed_kmh ?? 0,
      sequence: seq,
    };

    // Add progress data to broadcast if available
    if (progressData) {
      locationData.progress = progressData.progress;
      locationData.remainingDistanceMeters =
        progressData.remainingDistanceMeters;
      locationData.remainingDurationSeconds =
        progressData.remainingDurationSeconds;
      locationData.etaMins = progressData.etaMins;
      locationData.totalDistanceMeters = progressData.totalDistanceMeters;
    }

    this.logger.log(
      `Broadcasting trip:location_update to room ride:${rideId}: ${JSON.stringify(locationData)}`,
    );
    this.server.to(`ride:${rideId}`).emit('trip:location_update', locationData);

    return { event: 'ack', data: { sequence: seq } };
  }
}
