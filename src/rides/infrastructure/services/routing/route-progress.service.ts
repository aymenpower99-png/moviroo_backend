import { Injectable, Logger } from '@nestjs/common';
import { HaversineService } from '../haversine.service';
import { RouteSnappingService } from '../route-snapping.service';

export interface ProgressResult {
  progress: number; // 0.0 - 1.0
  remainingDistanceMeters: number;
  remainingDurationSeconds: number;
  etaMins: number;
  totalDistanceMeters: number;
}

@Injectable()
export class RouteProgressService {
  private readonly logger = new Logger(RouteProgressService.name);

  constructor(
    private readonly haversine: HaversineService,
    private readonly routeSnapping: RouteSnappingService,
  ) {}

  /**
   * Calculate straight-line distance between two points (Haversine fallback)
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const result = this.haversine.calculate(lat1, lon1, lat2, lon2);
    return result.distanceKm * 1000; // Convert km to meters
  }

  /**
   * Calculate ETA based on distance and speed
   * If speed is 0, use average speed of 40 km/h
   */
  calculateETA(distanceMeters: number, speedKmh: number): number {
    const avgSpeed = speedKmh > 0 ? speedKmh : 40; // Default to 40 km/h
    const speedMetersPerSecond = (avgSpeed * 1000) / 3600;
    const durationSeconds = distanceMeters / speedMetersPerSecond;
    return Math.ceil(durationSeconds / 60); // Return minutes
  }

  /**
   * Calculate progress based on remaining distance and total distance
   * progress = 1 - (remainingDistance / totalDistance)
   */
  calculateProgress(
    remainingDistanceMeters: number,
    totalDistanceMeters: number,
  ): number {
    if (totalDistanceMeters <= 0) return 0;
    const progress = 1 - remainingDistanceMeters / totalDistanceMeters;
    return Math.max(0, Math.min(1, progress)); // Clamp between 0 and 1
  }

  /**
   * Calculate full progress result for a ride
   * Used by TripTrackingGateway on each GPS update (legacy method)
   */
  async calculateProgressForRide(
    driverLat: number,
    driverLon: number,
    targetLat: number,
    targetLon: number,
    totalDistanceMeters: number,
    speedKmh: number,
  ): Promise<ProgressResult | null> {
    this.logger.log(
      `[ROUTE_PROGRESS] Calculate progress: driver (${driverLat}, ${driverLon}) → target (${targetLat}, ${targetLon})`,
    );

    // Calculate remaining distance
    const remainingDistanceMeters = this.calculateDistance(
      driverLat,
      driverLon,
      targetLat,
      targetLon,
    );

    // Calculate progress
    const progress = this.calculateProgress(
      remainingDistanceMeters,
      totalDistanceMeters,
    );

    // Calculate ETA
    const remainingDurationSeconds =
      remainingDistanceMeters /
      (((speedKmh > 0 ? speedKmh : 40) * 1000) / 3600);
    const etaMins = Math.ceil(remainingDurationSeconds / 60);

    this.logger.log(
      `[ROUTE_PROGRESS] Progress: ${(progress * 100).toFixed(1)}%, remaining: ${remainingDistanceMeters.toFixed(0)}m, ETA: ${etaMins}min`,
    );

    return {
      progress,
      remainingDistanceMeters,
      remainingDurationSeconds,
      etaMins,
      totalDistanceMeters,
    };
  }

  /**
   * Calculate route-based progress using GPS snapping
   * This is the new stable method that uses route geometry
   *
   * @param driverLat - Driver's current GPS latitude
   * @param driverLon - Driver's current GPS longitude
   * @param routeGeometry - Polyline encoded route geometry
   * @param routeDistanceMeters - Total route distance from Mapbox
   * @param routeDurationSeconds - Total route duration from Mapbox
   * @returns Progress result with route-based calculations
   */
  calculateProgressRouteBased(
    driverLat: number,
    driverLon: number,
    routeGeometry: string,
    routeDistanceMeters: number,
    routeDurationSeconds: number,
  ): ProgressResult | null {
    this.logger.log(
      `[ROUTE_PROGRESS] Calculate route-based progress: driver (${driverLat.toFixed(6)}, ${driverLon.toFixed(6)})`,
    );

    // Snap GPS to route
    const snapResult = this.routeSnapping.snapToRoute(
      driverLat,
      driverLon,
      routeGeometry,
    );
    if (!snapResult) {
      this.logger.error('[ROUTE_PROGRESS] Failed to snap GPS to route');
      return null;
    }

    // Calculate progress based on distance along route
    const progress = snapResult.distanceAlongRoute / routeDistanceMeters;
    const clampedProgress = Math.max(0, Math.min(1, progress));

    // Calculate remaining distance
    const remainingDistanceMeters =
      routeDistanceMeters - snapResult.distanceAlongRoute;

    // Calculate ETA using Mapbox duration (not GPS speed)
    const remainingDurationSeconds =
      routeDurationSeconds * (1 - clampedProgress);

    const result: ProgressResult = {
      progress: clampedProgress,
      remainingDistanceMeters,
      remainingDurationSeconds,
      etaMins: Math.ceil(remainingDurationSeconds / 60),
      totalDistanceMeters: routeDistanceMeters,
    };

    this.logger.log(
      `[ROUTE_PROGRESS] Route-based progress: ${(clampedProgress * 100).toFixed(1)}%, ETA: ${result.etaMins}min, Off-route: ${snapResult.isOffRoute}`,
    );

    return result;
  }

  /**
   * Map progress from old route to new route for continuity
   * When re-routing happens, this ensures progress doesn't jump
   *
   * @param oldProgress - Current progress on old route (0.0 - 1.0)
   * @param oldTotalDistance - Total distance of old route in meters
   * @param newTotalDistance - Total distance of new route in meters
   * @returns Mapped progress on new route (0.0 - 1.0)
   */
  mapProgressContinuity(
    oldProgress: number,
    oldTotalDistance: number,
    newTotalDistance: number,
  ): number {
    // Calculate distance already traveled on old route
    const distanceTraveled = oldProgress * oldTotalDistance;

    // Calculate equivalent progress on new route
    const newProgress = distanceTraveled / newTotalDistance;

    // Clamp between 0 and 1
    const clampedProgress = Math.max(0, Math.min(1, newProgress));

    this.logger.log(
      `[ROUTE_PROGRESS] Progress continuity mapping: old=${(oldProgress * 100).toFixed(1)}% (${distanceTraveled.toFixed(0)}m/${oldTotalDistance.toFixed(0)}m) → new=${(clampedProgress * 100).toFixed(1)}%`,
    );

    return clampedProgress;
  }

  /**
   * Calculate distance already traveled along a route from progress
   * @param progress - Current progress (0.0 - 1.0)
   * @param totalDistance - Total route distance in meters
   * @returns Distance traveled in meters
   */
  calculateDistanceTraveled(progress: number, totalDistance: number): number {
    return progress * totalDistance;
  }
}
