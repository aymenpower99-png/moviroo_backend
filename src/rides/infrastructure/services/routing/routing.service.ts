import { Injectable } from '@nestjs/common';
import { RouteCalculationService } from './route-calculation.service';
import { RouteProgressService } from './route-progress.service';
import { RouteCacheService } from './route-cache.service';
import { RouteCooldownService } from './route-cooldown.service';
import { RouteHistoryRepository } from '../../repositories/route-history.repository';
import type { RouteResult } from './route-calculation.service';
import type { ProgressResult } from './route-progress.service';

// Re-export types for backward compatibility
export type { RouteResult } from './route-calculation.service';
export type { ProgressResult } from './route-progress.service';

/**
 * Main Routing Service Facade
 * This service aggregates all routing-related services for backward compatibility
 */
@Injectable()
export class RoutingService {
  constructor(
    private readonly routeCalculation: RouteCalculationService,
    private readonly routeProgress: RouteProgressService,
    private readonly routeCache: RouteCacheService,
    private readonly routeCooldown: RouteCooldownService,
    private readonly routeHistoryRepo: RouteHistoryRepository,
  ) {}

  // Route Calculation methods
  async calculateRoute(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteResult | null> {
    return this.routeCalculation.calculateRoute(
      originLat,
      originLon,
      destLat,
      destLon,
    );
  }

  // Progress methods
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    return this.routeProgress.calculateDistance(lat1, lon1, lat2, lon2);
  }

  calculateETA(distanceMeters: number, speedKmh: number): number {
    return this.routeProgress.calculateETA(distanceMeters, speedKmh);
  }

  calculateProgress(
    remainingDistanceMeters: number,
    totalDistanceMeters: number,
  ): number {
    return this.routeProgress.calculateProgress(
      remainingDistanceMeters,
      totalDistanceMeters,
    );
  }

  async calculateProgressForRide(
    driverLat: number,
    driverLon: number,
    targetLat: number,
    targetLon: number,
    totalDistanceMeters: number,
    speedKmh: number,
  ): Promise<ProgressResult | null> {
    return this.routeProgress.calculateProgressForRide(
      driverLat,
      driverLon,
      targetLat,
      targetLon,
      totalDistanceMeters,
      speedKmh,
    );
  }

  calculateProgressRouteBased(
    driverLat: number,
    driverLon: number,
    routeGeometry: string,
    routeDistanceMeters: number,
    routeDurationSeconds: number,
  ): ProgressResult | null {
    return this.routeProgress.calculateProgressRouteBased(
      driverLat,
      driverLon,
      routeGeometry,
      routeDistanceMeters,
      routeDurationSeconds,
    );
  }

  mapProgressContinuity(
    oldProgress: number,
    oldTotalDistance: number,
    newTotalDistance: number,
  ): number {
    return this.routeProgress.mapProgressContinuity(
      oldProgress,
      oldTotalDistance,
      newTotalDistance,
    );
  }

  calculateDistanceTraveled(progress: number, totalDistance: number): number {
    return this.routeProgress.calculateDistanceTraveled(
      progress,
      totalDistance,
    );
  }

  // RouteHistory methods
  async storeRouteInHistory(
    rideId: string,
    routeGeometry: string,
    routeDistanceMeters: number,
    routeDurationSeconds: number,
    sequenceNumber: number,
  ): Promise<void> {
    await this.routeHistoryRepo.saveRoute(
      rideId,
      routeGeometry,
      routeDistanceMeters,
      routeDurationSeconds,
      sequenceNumber,
    );
  }

  async getRoutesFromHistory(rideId: string) {
    return this.routeHistoryRepo.findByRideId(rideId);
  }

  async getRouteFromHistoryBySequence(rideId: string, sequenceNumber: number) {
    return this.routeHistoryRepo.findByRideIdAndSequence(
      rideId,
      sequenceNumber,
    );
  }

  // Cache methods
  getDecodedRoute(rideId: string, routeGeometry: string): number[][] {
    return this.routeCache.getDecodedRoute(rideId, routeGeometry);
  }

  clearDecodedRouteCache(rideId: string): void {
    return this.routeCache.clearDecodedRouteCache(rideId);
  }

  clearAllDecodedRouteCaches(): void {
    return this.routeCache.clearAllDecodedRouteCaches();
  }

  async getCachedRouteDuration(rideId: string): Promise<number | null> {
    return this.routeCache.getCachedRouteDuration(rideId);
  }

  async cacheRouteDuration(
    rideId: string,
    durationSeconds: number,
  ): Promise<void> {
    return this.routeCache.cacheRouteDuration(rideId, durationSeconds);
  }

  async clearCachedRouteDuration(rideId: string): Promise<void> {
    return this.routeCache.clearCachedRouteDuration(rideId);
  }

  // Cooldown methods
  canReRoute(rideId: string): boolean {
    return this.routeCooldown.canReRoute(rideId);
  }

  markReRoute(rideId: string): void {
    return this.routeCooldown.markReRoute(rideId);
  }

  clearReRouteCooldown(rideId: string): void {
    return this.routeCooldown.clearReRouteCooldown(rideId);
  }

  clearAllReRouteCooldowns(): void {
    return this.routeCooldown.clearAllReRouteCooldowns();
  }
}
