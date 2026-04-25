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
      // Reject features without valid center coordinates
      if (
        !feature.center ||
        !Array.isArray(feature.center) ||
        feature.center.length < 2
      ) {
        this.logger.warn(
          `[GEOCODE] Mapbox forward returned feature without valid center for "${address}"`,
        );
        return null;
      }
      const [centerLon, centerLat] = feature.center;
      if (!this.isValidCoordinate(centerLat, centerLon)) {
        this.logger.warn(
          `[GEOCODE] Mapbox forward returned invalid coordinates (${centerLat}, ${centerLon}) for "${address}"`,
        );
        return null;
      }
      return this.parseMapboxResult(feature, centerLat, centerLon);
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

  /** Parallel autocomplete - Mapbox + Nominatim - CACHED */
  async autocompleteParallel(query: string): Promise<GeocodingResult[]> {
    const startTime = Date.now();
    this.logger.log(`[GEOCODE] Parallel autocomplete request: "${query}"`);

    if (!query || query.trim().length < 2) {
      this.logger.warn(
        `[GEOCODE] Parallel autocomplete query too short: "${query}"`,
      );
      return [];
    }

    // Check cache first
    const cacheKey = `autocomplete_parallel_v2:${query.trim().toLowerCase()}`;
    const cached = await this.cacheManager.get<GeocodingResult[]>(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      this.logger.log(
        `[GEOCODE] Cache HIT for parallel autocomplete: "${query}" - ${duration}ms - ${cached.length} results`,
      );
      return cached;
    }

    // Query both providers in parallel
    const apiStart = Date.now();
    const [mapboxResults, nominatimResults] = await Promise.allSettled([
      this.autocompleteMapbox(query),
      this.autocompleteNominatim(query),
    ]);

    const resultsMapbox =
      mapboxResults.status === 'fulfilled' ? mapboxResults.value : [];
    const resultsNominatim =
      nominatimResults.status === 'fulfilled' ? nominatimResults.value : [];

    const apiDuration = Date.now() - apiStart;

    this.logger.log(
      `[GEOCODE] Parallel autocomplete API results for "${query}" - Mapbox: ${resultsMapbox.length}, Nominatim: ${resultsNominatim.length} - ${apiDuration}ms`,
    );

    // Merge, filter, and deduplicate results
    const merged = [...resultsMapbox, ...resultsNominatim];
    const filtered = this.filterValidCoordinates(merged);
    const deduplicated = this.deduplicateResults(filtered);
    const results = deduplicated.slice(0, 10); // Return top 10 results
    await this.cacheManager.set(cacheKey, results, 300); // 5 minutes

    const totalDuration = Date.now() - startTime;
    this.logger.log(
      `[GEOCODE] Parallel autocomplete complete: "${query}" - ${totalDuration}ms - ${results.length} final results`,
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

      return data.features
        .map((feature: any) => {
          // Reject features without valid center coordinates
          if (
            !feature.center ||
            !Array.isArray(feature.center) ||
            feature.center.length < 2
          ) {
            return null;
          }
          const [centerLon, centerLat] = feature.center;
          if (!this.isValidCoordinate(centerLat, centerLon)) {
            return null;
          }
          return this.parseMapboxResult(feature, centerLat, centerLon);
        })
        .filter(
          (r: GeocodingResult | null): r is GeocodingResult => r !== null,
        );
    } catch (err) {
      this.logger.warn(`Mapbox autocomplete failed for "${query}": ${err}`);
      return [];
    }
  }

  /** Validate coordinates: not (0,0), not NaN, in valid range */
  private isValidCoordinate(lat: number, lon: number): boolean {
    if (lat === null || lat === undefined || lon === null || lon === undefined)
      return false;
    if (isNaN(lat) || isNaN(lon)) return false;
    if (lat === 0 && lon === 0) return false; // Reject (0,0) - usually a fallback
    if (lat < -90 || lat > 90) return false;
    if (lon < -180 || lon > 180) return false;
    return true;
  }

  /** Filter results with valid coordinates */
  private filterValidCoordinates(
    results: GeocodingResult[],
  ): GeocodingResult[] {
    const filtered = results.filter((result) =>
      this.isValidCoordinate(result.lat, result.lon),
    );

    if (filtered.length < results.length) {
      this.logger.log(
        `[GEOCODE] Filtered out ${results.length - filtered.length} results with invalid coordinates`,
      );
    }

    return filtered;
  }

  /** Deduplicate results by coordinate proximity */
  private deduplicateResults(results: GeocodingResult[]): GeocodingResult[] {
    const DEDUP_THRESHOLD_METERS = 50; // 50 meters threshold
    const seen = new Set<string>();
    const deduplicated: GeocodingResult[] = [];

    for (const result of results) {
      // Check if this location is too close to any already seen location
      let isDuplicate = false;

      for (const seenResult of seen) {
        const [seenLat, seenLon] = seenResult.split(',').map(Number);
        const distance = this.calculateDistance(
          result.lat,
          result.lon,
          seenLat,
          seenLon,
        );

        if (distance <= DEDUP_THRESHOLD_METERS) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        deduplicated.push(result);
        // Store coordinate key for future comparisons
        seen.add(`${result.lat},${result.lon}`);
      }
    }

    this.logger.log(
      `[GEOCODE] Deduplicated ${results.length} results to ${deduplicated.length} unique locations`,
    );

    return deduplicated;
  }

  /** Calculate distance between two coordinates in meters using Haversine formula */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000; // Earth's radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /** Nominatim autocomplete */
  private async autocompleteNominatim(
    query: string,
  ): Promise<GeocodingResult[]> {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&addressdetails=1&countrycodes=tn`;

      const res = await withRetry(
        () =>
          fetch(url, {
            headers: {
              'User-Agent': 'Moviroo-Backend/1.0',
            },
          }),
        `Nominatim autocomplete "${query}"`,
        { maxRetries: 2, initialDelayMs: 500 },
        this.logger,
      );

      const data = (await res.json()) as any;

      if (!data || data.length === 0) {
        return [];
      }

      return data
        .map((item: any) => {
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          // Reject invalid coordinates from Nominatim
          if (!this.isValidCoordinate(lat, lon)) {
            return null;
          }
          const address = item.address || {};
          return {
            lat,
            lon,
            display_name: item.display_name || item.name || '',
            city: address.city || address.town || address.village || '',
            country: address.country || 'Tunisia',
          };
        })
        .filter(
          (r: GeocodingResult | null): r is GeocodingResult => r !== null,
        );
    } catch (err) {
      this.logger.warn(`Nominatim autocomplete failed for "${query}": ${err}`);
      return [];
    }
  }
}
