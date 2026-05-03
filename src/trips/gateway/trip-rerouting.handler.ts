import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { RoutingService } from '../../rides/infrastructure/services/routing/routing.service';
import { RouteHistoryRepository } from '../../rides/infrastructure/repositories/route-history.repository';
import { RouteSnappingService } from '../../rides/infrastructure/services/route-snapping.service';
// @ts-ignore - @mapbox/polyline doesn't have TypeScript definitions
const polyline = require('@mapbox/polyline');

/**
 * Handler for off-route detection and dynamic rerouting
 */
export class TripReroutingHandler {
  private readonly logger = new Logger(TripReroutingHandler.name);

  constructor(
    private readonly routeSnappingService: RouteSnappingService,
    private readonly routingService: RoutingService,
    private readonly routeHistoryRepo: RouteHistoryRepository,
    private readonly progressCache: Map<
      string,
      { data: any; timestamp: number }
    >,
    private readonly server: Server,
  ) {}

  /**
   * Check if driver is off-route using RouteSnappingService
   */
  isOffRoute(
    driverLat: number,
    driverLon: number,
    routeGeometry: string,
  ): boolean {
    const snapResult = this.routeSnappingService.snapToRoute(
      driverLat,
      driverLon,
      routeGeometry,
    );
    return snapResult?.isOffRoute ?? false;
  }

  /**
   * Handle dynamic rerouting when driver is off-route
   * - Check cooldown before rerouting
   * - Recalculate route from current GPS to destination
   * - Store new route in RouteHistory with next sequence number
   * - Mark reroute in cooldown
   */
  async handleOffRouteRerouting(
    rideId: string,
    ride: Ride,
    driverLat: number,
    driverLon: number,
  ): Promise<void> {
    // Check if driver is in active ride
    const activeTripStatuses = [
      'ASSIGNED',
      'EN_ROUTE_TO_PICKUP',
      'ARRIVED',
      'IN_TRIP',
    ];
    if (!activeTripStatuses.includes(ride.status)) {
      this.logger.log(
        `[REROUTE] Ride ${rideId} status is ${ride.status} (not active) - skipping reroute`,
      );
      return;
    }

    // Check cooldown before rerouting
    if (!this.routingService.canReRoute(rideId)) {
      this.logger.log(
        `[REROUTE] Ride ${rideId} is in cooldown - skipping reroute`,
      );
      return;
    }

    // Determine destination based on ride status
    const destLat =
      ride.status === 'IN_TRIP' ? ride.dropoffLat : ride.pickupLat;
    const destLon =
      ride.status === 'IN_TRIP' ? ride.dropoffLon : ride.pickupLon;

    if (destLat == null || destLon == null) {
      this.logger.error(
        `[REROUTE] Ride ${rideId} has no destination - skipping reroute`,
      );
      return;
    }

    this.logger.log(
      `[REROUTE] Driver off-route for ride ${rideId} - recalculating route from (${driverLat}, ${driverLon}) to (${destLat}, ${destLon})`,
    );

    // Calculate new route
    const newRoute = await this.routingService.calculateRoute(
      driverLat,
      driverLon,
      destLat,
      destLon,
    );

    if (!newRoute) {
      this.logger.error(
        `[REROUTE] Failed to calculate new route for ride ${rideId}`,
      );
      return;
    }

    // Get next sequence number for this ride
    const existingRoutes = await this.routeHistoryRepo.findByRideId(rideId);
    const nextSequence = existingRoutes.length + 1;

    // Store new route in RouteHistory
    await this.routingService.storeRouteInHistory(
      rideId,
      newRoute.geometry,
      newRoute.distanceMeters,
      newRoute.durationSeconds,
      nextSequence,
    );

    // Mark reroute in cooldown
    this.routingService.markReRoute(rideId);

    // Clear progress cache to force recalculation with new route
    this.progressCache.delete(rideId);

    this.logger.log(
      `[REROUTE] Successfully rerouted ride ${rideId} - new route stored with sequence ${nextSequence}`,
    );

    // Decode polyline to flattened coordinates for frontend
    // Polyline is encoded as [lat, lng], we need to flatten to [lng, lat, lng, lat, ...]
    const decodedCoordinates = polyline.decode(newRoute.geometry);
    const flattenedCoordinates: number[] = [];
    for (const [lat, lng] of decodedCoordinates) {
      flattenedCoordinates.push(lng, lat); // GeoJSON uses [lng, lat] order
    }

    // Emit reroute event to notify clients with flattened coordinates
    this.server.to(`ride:${rideId}`).emit('trip:reroute', {
      rideId,
      sequence: nextSequence,
      routeGeometry: flattenedCoordinates,
      routeDistanceMeters: newRoute.distanceMeters,
      routeDurationSeconds: newRoute.durationSeconds,
    });
  }
}
