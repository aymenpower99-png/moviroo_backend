import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
// @ts-ignore - @mapbox/polyline doesn't have TypeScript definitions
const polyline = require('@mapbox/polyline');

@Injectable()
export class RouteCacheService {
  private readonly logger = new Logger(RouteCacheService.name);

  // In-memory cache for decoded routes (rideId → decoded coordinates)
  private decodedRouteCache = new Map<string, number[][]>();

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Get decoded route coordinates from cache or decode from polyline
   * This prevents repeated polyline decoding on every GPS update
   */
  getDecodedRoute(rideId: string, routeGeometry: string): number[][] {
    // Check cache first
    const cached = this.decodedRouteCache.get(rideId);
    if (cached) {
      this.logger.log(`[ROUTE_CACHE] Cache HIT for decoded route ${rideId}`);
      return cached;
    }

    // Cache miss - decode polyline
    this.logger.log(
      `[ROUTE_CACHE] Cache MISS for decoded route ${rideId} - decoding polyline`,
    );
    const decoded = polyline.decode(routeGeometry);

    // Auto-correct swapped lat/lng from old route data
    if (decoded && decoded.length > 0) {
      const first = decoded[0];
      const looksSwapped =
        first[0] >= 5 && first[0] <= 15 && first[1] >= 25 && first[1] <= 40;
      if (looksSwapped) {
        this.logger.warn(
          `[ROUTE_CACHE] Detected swapped lat/lng — auto-correcting ${decoded.length} points`,
        );
        for (const coord of decoded) {
          const tmp = coord[0];
          coord[0] = coord[1];
          coord[1] = tmp;
        }
      }
    }

    // Store in cache
    this.decodedRouteCache.set(rideId, decoded);
    this.logger.log(`[ROUTE_CACHE] Decoded route cached for ${rideId}`);

    return decoded;
  }

  /**
   * Clear decoded route cache for a specific ride
   * Called when trip ends or when re-routing happens
   */
  clearDecodedRouteCache(rideId: string): void {
    this.decodedRouteCache.delete(rideId);
    this.logger.log(`[ROUTE_CACHE] Decoded route cache cleared for ${rideId}`);
  }

  /**
   * Clear all decoded route caches (e.g., on server restart or memory cleanup)
   */
  clearAllDecodedRouteCaches(): void {
    const count = this.decodedRouteCache.size;
    this.decodedRouteCache.clear();
    this.logger.log(`[ROUTE_CACHE] Cleared ${count} decoded route caches`);
  }

  /**
   * Get cached route duration for ETA fallback
   * Returns cached duration if available, null otherwise
   */
  async getCachedRouteDuration(rideId: string): Promise<number | null> {
    const cacheKey = `route_duration:${rideId}`;
    const cached = await this.cacheManager.get<number>(cacheKey);
    if (cached) {
      this.logger.log(
        `[ROUTE_CACHE] Cache HIT for route duration ${rideId}: ${cached}s`,
      );
      return cached;
    }
    return null;
  }

  /**
   * Cache route duration for ETA fallback
   * Caches for 5 minutes
   */
  async cacheRouteDuration(
    rideId: string,
    durationSeconds: number,
  ): Promise<void> {
    const cacheKey = `route_duration:${rideId}`;
    await this.cacheManager.set(cacheKey, durationSeconds, 300); // 5 minutes
    this.logger.log(
      `[ROUTE_CACHE] Cached route duration for ${rideId}: ${durationSeconds}s`,
    );
  }

  /**
   * Clear cached route duration for a specific ride
   */
  async clearCachedRouteDuration(rideId: string): Promise<void> {
    const cacheKey = `route_duration:${rideId}`;
    await this.cacheManager.del(cacheKey);
    this.logger.log(
      `[ROUTE_CACHE] Cleared cached route duration for ${rideId}`,
    );
  }
}
