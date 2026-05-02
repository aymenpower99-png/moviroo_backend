import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { withRetry } from '../../../../common/utils/retry.util';
// @ts-ignore - @mapbox/polyline doesn't have TypeScript definitions
const polyline = require('@mapbox/polyline');

export interface RouteResult {
  geometry: string; // Polyline encoded string (compressed format)
  distanceMeters: number;
  durationSeconds: number;
}

@Injectable()
export class RouteCalculationService {
  private readonly logger = new Logger(RouteCalculationService.name);

  private readonly MAPBOX_ACCESS_TOKEN =
    process.env.MAPBOX_ACCESS_TOKEN ||
    'pk.eyJ1IjoiYXltb3VuMTEiLCJhIjoiY21vM2JvY3UzMGtrdzJzcXc0cXZwbmE5eiJ9.LcnOY7q-WQ37STLy7wogRA';
  private readonly MAPBOX_DIRECTIONS_URL =
    'https://api.mapbox.com/directions/v5/mapbox/driving';

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

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
      `[ROUTE_CALC] Calculate route: (${originLat}, ${originLon}) → (${destLat}, ${destLon})`,
    );

    // Validate coordinates
    this.validateCoordinates(originLat, originLon, destLat, destLon);

    // Check cache first
    const cacheKey = `route:${originLat.toFixed(6)}:${originLon.toFixed(6)}:${destLat.toFixed(6)}:${destLon.toFixed(6)}`;
    const cached = await this.cacheManager.get<RouteResult>(cacheKey);
    if (cached) {
      this.logger.log(`[ROUTE_CALC] Cache HIT for route`);
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
        this.logger.warn('[ROUTE_CALC] No routes returned from Mapbox');
        return null;
      }

      const route = routes[0];
      const geometry = route.geometry as any;
      const coordinates = geometry.coordinates as number[][];

      // Mapbox GeoJSON returns coordinates as [lng, lat],
      // but @mapbox/polyline.encode() expects [lat, lng] — swap them.
      const latLngCoordinates = coordinates.map(([lng, lat]) => [lat, lng]);
      const polylineString = polyline.encode(latLngCoordinates);

      const result: RouteResult = {
        geometry: polylineString,
        distanceMeters: route.distance,
        durationSeconds: route.duration,
      };

      // Cache result for 5 minutes
      await this.cacheManager.set(cacheKey, result, 300);
      this.logger.log(
        `[ROUTE_CALC] Route calculated: ${result.distanceMeters.toFixed(0)}m, ${result.durationSeconds.toFixed(0)}s`,
      );

      return result;
    } catch (err) {
      this.logger.error(`[ROUTE_CALC] Mapbox API error: ${err}`);
      return null;
    }
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
