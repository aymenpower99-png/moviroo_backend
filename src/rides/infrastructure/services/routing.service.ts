import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { withRetry } from '../../../common/utils/retry.util';
import { HaversineService } from './haversine.service';

export interface RouteResult {
  geometry: number[]; // Flattened coordinates [lon, lat, lon, lat, ...]
  distanceMeters: number;
  durationSeconds: number;
}

export interface ProgressResult {
  progress: number; // 0.0 - 1.0
  remainingDistanceMeters: number;
  remainingDurationSeconds: number;
  etaMins: number;
  totalDistanceMeters: number;
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  // Mapbox configuration (same as GeocodingService)
  private readonly MAPBOX_ACCESS_TOKEN =
    process.env.MAPBOX_ACCESS_TOKEN ||
    'pk.eyJ1IjoiYXltb3VuMTEiLCJhIjoiY21vM2JvY3UzMGtrdzJzcXc0cXZwbmE5eiJ9.LcnOY7q-WQ37STLy7wogRA';
  private readonly MAPBOX_DIRECTIONS_URL =
    'https://api.mapbox.com/directions/v5/mapbox/driving';

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly haversine: HaversineService,
  ) {}

  /**
   * Calculate route between two points using Mapbox Directions API
   * Returns route geometry, distance, and duration
   */
  async calculateRoute(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteResult | null> {
    this.logger.log(
      `[ROUTING] Calculate route: (${originLat}, ${originLon}) → (${destLat}, ${destLon})`,
    );

    // Validate coordinates
    this.validateCoordinates(originLat, originLon, destLat, destLon);

    // Check cache first
    const cacheKey = `route:${originLat.toFixed(6)}:${originLon.toFixed(6)}:${destLat.toFixed(6)}:${destLon.toFixed(6)}`;
    const cached = await this.cacheManager.get<RouteResult>(cacheKey);
    if (cached) {
      this.logger.log(`[ROUTING] Cache HIT for route`);
      return cached;
    }

    try {
      const url = `${this.MAPBOX_DIRECTIONS_URL}/${originLon},${originLat};${destLon},${destLat}`;
      const params = new URLSearchParams({
        access_token: this.MAPBOX_ACCESS_TOKEN,
        geometries: 'geojson',
        overview: 'full',
      });

      const res = await withRetry(
        () => fetch(`${url}?${params.toString()}`),
        `Mapbox Directions API (${originLat}, ${originLon}) → (${destLat}, ${destLon})`,
        { maxRetries: 2, initialDelayMs: 500 },
        this.logger,
      );

      if (!res.ok) {
        throw new Error(`Mapbox API responded with status ${res.status}`);
      }

      const data = (await res.json()) as any;
      const routes = data.routes as any[];

      if (!routes || routes.length === 0) {
        this.logger.warn('[ROUTING] No routes returned from Mapbox');
        return null;
      }

      const route = routes[0];
      const geometry = route.geometry as any;
      const coordinates = geometry.coordinates as number[][];

      // Flatten coordinates: [[lon, lat], [lon, lat]] → [lon, lat, lon, lat]
      const flattened: number[] = [];
      for (const coord of coordinates) {
        flattened.push(coord[0]); // lon
        flattened.push(coord[1]); // lat
      }

      const result: RouteResult = {
        geometry: flattened,
        distanceMeters: route.distance,
        durationSeconds: route.duration,
      };

      // Cache result for 5 minutes
      await this.cacheManager.set(cacheKey, result, 300);
      this.logger.log(
        `[ROUTING] Route calculated: ${result.distanceMeters.toFixed(0)}m, ${result.durationSeconds.toFixed(0)}s`,
      );

      return result;
    } catch (err) {
      this.logger.error(`[ROUTING] Mapbox API error: ${err}`);
      return null;
    }
  }

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
   * Used by TripTrackingGateway on each GPS update
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
      `[ROUTING] Calculate progress: driver (${driverLat}, ${driverLon}) → target (${targetLat}, ${targetLon})`,
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
    const remainingDurationSeconds = (remainingDistanceMeters / ((speedKmh > 0 ? speedKmh : 40) * 1000 / 3600));
    const etaMins = Math.ceil(remainingDurationSeconds / 60);

    this.logger.log(
      `[ROUTING] Progress: ${(progress * 100).toFixed(1)}%, remaining: ${remainingDistanceMeters.toFixed(0)}m, ETA: ${etaMins}min`,
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
   * Validate coordinates are valid
   */
  private validateCoordinates(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): void {
    const isInvalid = (lat: number, lon: number) =>
      lat === undefined ||
      lat === null ||
      lon === undefined ||
      lon === null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      (lat === 0 && lon === 0) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180;

    if (isInvalid(lat1, lon1)) {
      throw new Error(
        `Invalid origin coordinates (${lat1}, ${lon1}). Must be valid lat/lon, not (0,0).`,
      );
    }

    if (isInvalid(lat2, lon2)) {
      throw new Error(
        `Invalid destination coordinates (${lat2}, ${lon2}). Must be valid lat/lon, not (0,0).`,
      );
    }
  }
}
