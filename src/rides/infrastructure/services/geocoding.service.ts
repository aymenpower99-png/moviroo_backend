import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { withRetry } from '../../../common/utils/retry.util';

export interface GeocodingResult {
  lat: number;
  lon: number;
  display_name: string;
  city: string;
  country: string;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  // Mapbox configuration
  private readonly MAPBOX_ACCESS_TOKEN =
    process.env.MAPBOX_ACCESS_TOKEN ||
    'pk.eyJ1IjoiYXltb3VuMTEiLCJhIjoiY21vM2JvY3UzMGtrdzJzcXc0cXZwbmE5eiJ9.LcnOY7q-WQ37STLy7wogRA';
  private readonly MAPBOX_BASE_URL =
    'https://api.mapbox.com/geocoding/v5/mapbox.places';

  /** Address → coordinates (forward geocoding) - Mapbox only */
  async forward(address: string): Promise<GeocodingResult | null> {
    try {
      const url = `${this.MAPBOX_BASE_URL}/${encodeURIComponent(address)}.json?access_token=${this.MAPBOX_ACCESS_TOKEN}&limit=1&country=tn`;
      const res = await withRetry(
        () => fetch(url),
        `Mapbox forward geocoding "${address}"`,
        { maxRetries: 2, initialDelayMs: 500 },
        this.logger,
      );
      const data = (await res.json()) as any;
      if (!data.features || data.features.length === 0) return null;
      const feature = data.features[0];
      const center = feature.center || [0, 0];
      return this.parseMapboxResult(feature, center[1], center[0]);
    } catch (err) {
      this.logger.warn(`Forward geocoding failed for "${address}": ${err}`);
      return null;
    }
  }

  /** Coordinates → address (reverse geocoding) - Mapbox only - CACHED */
  async reverse(lat: number, lon: number): Promise<GeocodingResult | null> {
    const startTime = Date.now();
    this.logger.log(`[GEOCODE] Reverse geocoding request: (${lat}, ${lon})`);

    // Check cache first (new cache key to invalidate pre-migration data)
    const cacheKey = `reverse_geocode_v2:${lat.toFixed(6)}:${lon.toFixed(6)}`;
    const cached = await this.cacheManager.get<GeocodingResult>(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      this.logger.log(
        `[GEOCODE] Cache HIT for reverse geocoding: (${lat}, ${lon}) - ${duration}ms`,
      );
      return cached;
    }

    // Use Mapbox only
    const mapboxStart = Date.now();
    const mapboxResult = await this.reverseMapbox(lat, lon);
    const mapboxDuration = Date.now() - mapboxStart;

    if (mapboxResult) {
      const totalDuration = Date.now() - startTime;
      this.logger.log(
        `[GEOCODE] Reverse geocoding via Mapbox: (${lat}, ${lon}) - ${totalDuration}ms`,
      );
      await this.cacheManager.set(cacheKey, mapboxResult, 600); // 10 minutes
      return mapboxResult;
    }

    // Safe fallback: return minimal result with coordinates
    this.logger.warn(
      `[GEOCODE] Mapbox geocoding failed, using safe fallback for (${lat}, ${lon})`,
    );
    const safeResult: GeocodingResult = {
      lat,
      lon,
      display_name: `Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
      city: 'Unknown',
      country: 'Tunisia',
    };

    const totalDuration = Date.now() - startTime;
    this.logger.log(
      `[GEOCODE] Safe fallback used: (${lat}, ${lon}) - ${totalDuration}ms`,
    );
    await this.cacheManager.set(cacheKey, safeResult, 300); // 5 minutes for safe fallback
    return safeResult;
  }

  /** Mapbox reverse geocoding */
  private async reverseMapbox(
    lat: number,
    lon: number,
  ): Promise<GeocodingResult | null> {
    try {
      const url = `${this.MAPBOX_BASE_URL}/${lon},${lat}.json?access_token=${this.MAPBOX_ACCESS_TOKEN}&types=poi,address,place,locality,neighborhood`;

      const res = await withRetry(
        () => fetch(url),
        `Mapbox reverse geocoding (${lat}, ${lon})`,
        { maxRetries: 2, initialDelayMs: 500 },
        this.logger,
      );

      const data = (await res.json()) as any;

      if (!data.features || data.features.length === 0) {
        return null;
      }

      const feature = data.features[0];
      return this.parseMapboxResult(feature, lat, lon);
    } catch (err) {
      this.logger.warn(
        `Mapbox reverse geocoding failed for (${lat}, ${lon}): ${err}`,
      );
      return null;
    }
  }

  /** Parse Mapbox result into standard format */
  private parseMapboxResult(
    feature: any,
    lat: number,
    lon: number,
  ): GeocodingResult {
    const placeName = feature.text || feature.place_name || '';
    const context = feature.context || [];

    // Extract city from context
    const cityContext = context.find(
      (c: any) => c.id.includes('place') || c.id.includes('locality'),
    );
    const city = cityContext?.text || '';

    // Extract country from context
    const countryContext = context.find((c: any) => c.id.includes('country'));
    const country = countryContext?.text || 'Tunisia';

    return {
      lat,
      lon,
      display_name: placeName,
      city,
      country,
    };
  }

  /** Autocomplete - Mapbox only - CACHED */
  async autocomplete(query: string): Promise<GeocodingResult[]> {
    const startTime = Date.now();
    this.logger.log(`[GEOCODE] Autocomplete request: "${query}"`);

    if (!query || query.trim().length < 2) {
      this.logger.warn(`[GEOCODE] Autocomplete query too short: "${query}"`);
      return [];
    }

    // Check cache first (new cache key to invalidate pre-migration data)
    const cacheKey = `autocomplete_v2:${query.trim().toLowerCase()}`;
    const cached = await this.cacheManager.get<GeocodingResult[]>(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      this.logger.log(
        `[GEOCODE] Cache HIT for autocomplete: "${query}" - ${duration}ms - ${cached.length} results`,
      );
      return cached;
    }

    // Query Mapbox only
    const apiStart = Date.now();
    const mapboxResults = await this.autocompleteMapbox(query);
    const apiDuration = Date.now() - apiStart;

    this.logger.log(
      `[GEOCODE] Autocomplete API results for "${query}" - Mapbox: ${mapboxResults.length} - ${apiDuration}ms`,
    );

    const results = mapboxResults.slice(0, 10); // Return top 10 results
    await this.cacheManager.set(cacheKey, results, 300); // 5 minutes

    const totalDuration = Date.now() - startTime;
    this.logger.log(
      `[GEOCODE] Autocomplete complete: "${query}" - ${totalDuration}ms - ${results.length} final results`,
    );
    return results;
  }

  /** Mapbox autocomplete */
  private async autocompleteMapbox(query: string): Promise<GeocodingResult[]> {
    try {
      const url = `${this.MAPBOX_BASE_URL}/${encodeURIComponent(query)}.json?access_token=${this.MAPBOX_ACCESS_TOKEN}&autocomplete=true&limit=10&country=tn&types=poi,address,place,locality,neighborhood`;

      const res = await withRetry(
        () => fetch(url),
        `Mapbox autocomplete "${query}"`,
        { maxRetries: 2, initialDelayMs: 500 },
        this.logger,
      );

      const data = (await res.json()) as any;

      if (!data.features || data.features.length === 0) {
        return [];
      }

      return data.features.map((feature: any) => {
        const center = feature.center || [0, 0];
        return this.parseMapboxResult(feature, center[1], center[0]);
      });
    } catch (err) {
      this.logger.warn(`Mapbox autocomplete failed for "${query}": ${err}`);
      return [];
    }
  }
}
