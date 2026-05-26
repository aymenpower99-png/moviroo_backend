import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { GeocodingMapboxService, GeocodingResult } from './geocoding-mapbox.service';
import { GeocodingNominatimService } from './geocoding-nominatim.service';

// Re-export types for backward compatibility
export type { GeocodingResult };

interface AutocompleteOptions {
  proximity?: { lat: number; lon: number };
  lang?: string;
}

/**
 * Main Geocoding Service Facade
 * This service aggregates all geocoding-related services for backward compatibility
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly mapboxService: GeocodingMapboxService,
    private readonly nominatimService: GeocodingNominatimService,
  ) {}

  /** Address → coordinates (forward geocoding) - Mapbox only */
  async forward(address: string): Promise<GeocodingResult | null> {
    return this.mapboxService.forward(address);
  }

  /** Coordinates → address (reverse geocoding) - Mapbox primary + Nominatim fallback - CACHED */
  async reverse(lat: number, lon: number, options?: { lang?: string }): Promise<GeocodingResult | null> {
    const startTime = Date.now();
    this.logger.log(`[GEOCODE] Reverse geocoding request: (${lat}, ${lon})`);

    const langKey = options?.lang ?? 'default';
    const cacheKey = `reverse_geocode_v2:${lat.toFixed(6)}:${lon.toFixed(6)}:${langKey}`;
    const cached = await this.cacheManager.get<GeocodingResult>(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      this.logger.log(
        `[GEOCODE] Cache HIT for reverse geocoding: (${lat}, ${lon}) - ${duration}ms`,
      );
      return cached;
    }

    // Primary: Mapbox
    const mapboxResult = await this.mapboxService.reverse(lat, lon, options);

    // Accept Mapbox only if it returns a precise result (address or poi level)
    if (mapboxResult && this._getPrecisionScore(mapboxResult) >= 2) {
      const totalDuration = Date.now() - startTime;
      this.logger.log(
        `[GEOCODE] Reverse geocoding via Mapbox (precise): (${lat}, ${lon}) - ${totalDuration}ms`,
      );
      await this.cacheManager.set(cacheKey, mapboxResult, 600);
      return mapboxResult;
    }

    // Fallback: Nominatim when Mapbox is low-precision or empty
    const nominatimResult = await this.nominatimService.reverse(lat, lon, options);
    if (nominatimResult) {
      const totalDuration = Date.now() - startTime;
      this.logger.log(
        `[GEOCODE] Reverse geocoding via Nominatim fallback: (${lat}, ${lon}) - ${totalDuration}ms`,
      );
      await this.cacheManager.set(cacheKey, nominatimResult, 600);
      return nominatimResult;
    }

    // Accept low-precision Mapbox if Nominatim also failed
    if (mapboxResult) {
      await this.cacheManager.set(cacheKey, mapboxResult, 600);
      return mapboxResult;
    }

    // Safe fallback — localized generic label
    this.logger.warn(
      `[GEOCODE] All reverse geocoding failed, using safe fallback for (${lat}, ${lon})`,
    );
    const safeLabel = this._localizedFallbackLabel(lat, lon, options?.lang);
    const safeResult: GeocodingResult = {
      lat,
      lon,
      display_name: safeLabel,
      address: safeLabel,
      city: 'Unknown',
      country: 'Tunisia',
      source: 'fallback',
    };
    await this.cacheManager.set(cacheKey, safeResult, 300);
    return safeResult;
  }

  /** Nearby places around coordinates - Mapbox primary + Nominatim fallback - CACHED */
  async nearby(lat: number, lon: number, options?: { lang?: string }): Promise<GeocodingResult[]> {
    const startTime = Date.now();
    this.logger.log(`[GEOCODE] Nearby request: (${lat}, ${lon})`);

    const langKey = options?.lang ?? 'default';
    const cacheKey = `nearby_v2:${lat.toFixed(4)}:${lon.toFixed(4)}:${langKey}`;
    const cached = await this.cacheManager.get<GeocodingResult[]>(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      this.logger.log(
        `[GEOCODE] Cache HIT for nearby: (${lat}, ${lon}) - ${duration}ms`,
      );
      return cached;
    }

    // Primary: Mapbox nearby (with locale for localized results)
    const mapboxResults = await this.mapboxService.nearby(lat, lon, options);

    // If Mapbox returns only low-precision results (no address/poi), supplement with Nominatim
    const mapboxHighPrecision = mapboxResults.filter(
      (r) => this._getPrecisionScore(r) >= 2,
    );

    let results: GeocodingResult[] = [];

    if (mapboxHighPrecision.length >= 3) {
      // Mapbox is good enough
      results = mapboxResults;
    } else {
      // Fallback: query Nominatim for the nearest POI/place with extratags
      const nominatimResults = await this.nominatimService.nearby(lat, lon, options);
      const merged = [...mapboxResults, ...nominatimResults];
      const filtered = this.filterValidCoordinates(merged);
      const deduplicated = this.deduplicateResults(filtered, 200); // relaxed threshold for nearby
      results = this.rankByPrecision(deduplicated);
    }

    await this.cacheManager.set(cacheKey, results, 300);

    const totalDuration = Date.now() - startTime;
    this.logger.log(
      `[GEOCODE] Nearby complete: (${lat}, ${lon}) - ${totalDuration}ms - ${results.length} results`,
    );
    return results;
  }

  /** Autocomplete - delegates to parallel search (Mapbox + Nominatim) - CACHED */
  async autocomplete(query: string, options?: AutocompleteOptions): Promise<GeocodingResult[]> {
    // autocomplete() now uses the same parallel logic as autocompleteParallel()
    // to ensure Nominatim fallback is always available
    return this.autocompleteParallel(query, options);
  }

  /** Parallel autocomplete - Mapbox + Nominatim with precision ranking - CACHED */
  async autocompleteParallel(query: string, options?: AutocompleteOptions): Promise<GeocodingResult[]> {
    const startTime = Date.now();
    this.logger.log(`[GEOCODE] Parallel autocomplete request: "${query}"`);

    if (!query || query.trim().length < 2) {
      this.logger.warn(
        `[GEOCODE] Parallel autocomplete query too short: "${query}"`,
      );
      return [];
    }

    const proxKey = options?.proximity
      ? `${options.proximity.lat.toFixed(2)},${options.proximity.lon.toFixed(2)}`
      : 'none';
    const cacheKey = `autocomplete_parallel_v2:${query.trim().toLowerCase()}:${proxKey}:${options?.lang ?? 'default'}`;
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
      this.mapboxService.autocomplete(query, options),
      this.nominatimService.autocomplete(query, options),
    ]);

    const resultsMapbox =
      mapboxResults.status === 'fulfilled' ? mapboxResults.value : [];
    const resultsNominatim =
      nominatimResults.status === 'fulfilled' ? nominatimResults.value : [];

    const apiDuration = Date.now() - apiStart;

    this.logger.log(
      `[GEOCODE] Parallel autocomplete API results for "${query}" - Mapbox: ${resultsMapbox.length}, Nominatim: ${resultsNominatim.length} - ${apiDuration}ms`,
    );

    // Merge all results
    const merged = [...resultsMapbox, ...resultsNominatim];
    const filtered = this.filterValidCoordinates(merged);
    const deduplicated = this.deduplicateResults(filtered);

    // Rank by precision score (poi > address > neighborhood > locality > place)
    const ranked = this.rankByPrecision(deduplicated);

    // If we have high-precision results (poi/address), drop low-precision city-level results
    const highPrecisionCount = ranked.filter((r) => this._getPrecisionScore(r) >= 2).length;
    let results: GeocodingResult[];
    if (highPrecisionCount >= 3) {
      // Enough precise results — drop city-level 'place' results entirely
      results = ranked.filter((r) => this._getPrecisionScore(r) >= 1);
    } else {
      // Not enough precise results — keep everything but still rank them
      results = ranked;
    }

    // Return top 10 after ranking and filtering
    const finalResults = results.slice(0, 10);
    await this.cacheManager.set(cacheKey, finalResults, 300);

    const totalDuration = Date.now() - startTime;
    this.logger.log(
      `[GEOCODE] Parallel autocomplete complete: "${query}" - ${totalDuration}ms - ${finalResults.length} final results`,
    );
    return finalResults;
  }

  /** Precision score based on place_type (higher = more precise) */
  private _getPrecisionScore(result: GeocodingResult): number {
    const type = (result.place_type || '').toLowerCase();
    if (type.includes('poi')) return 4;
    if (type.includes('address')) return 3;
    if (type.includes('neighborhood')) return 2;
    if (type.includes('locality')) return 1;
    if (type.includes('place')) return 0;
    return 1; // unknown defaults to medium
  }

  /** Rank results by precision score descending */
  private rankByPrecision(results: GeocodingResult[]): GeocodingResult[] {
    return [...results].sort((a, b) => {
      const scoreA = this._getPrecisionScore(a);
      const scoreB = this._getPrecisionScore(b);
      if (scoreB !== scoreA) return scoreB - scoreA; // higher score first
      // Tie-breaker: shorter display_name = more specific
      return (a.display_name || '').length - (b.display_name || '').length;
    });
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
  private deduplicateResults(results: GeocodingResult[], thresholdMeters?: number): GeocodingResult[] {
    const DEDUP_THRESHOLD_METERS = thresholdMeters ?? 50;
    const seen = new Set<string>();
    const deduplicated: GeocodingResult[] = [];

    for (const result of results) {
      // High-precision results (poi/address) use stricter dedup, low-precision uses looser
      const isHighPrecision = this._getPrecisionScore(result) >= 2;
      const effectiveThreshold = isHighPrecision ? Math.min(DEDUP_THRESHOLD_METERS, 50) : DEDUP_THRESHOLD_METERS;

      let isDuplicate = false;
      for (const seenResult of seen) {
        const [seenLat, seenLon] = seenResult.split(',').map(Number);
        const distance = this.calculateDistance(
          result.lat,
          result.lon,
          seenLat,
          seenLon,
        );

        if (distance <= effectiveThreshold) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        deduplicated.push(result);
        seen.add(`${result.lat},${result.lon}`);
      }
    }

    this.logger.log(
      `[GEOCODE] Deduplicated ${results.length} results to ${deduplicated.length} unique locations`,
    );

    return deduplicated;
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

  /** Localized fallback label when all providers fail */
  private _localizedFallbackLabel(lat: number, lon: number, lang?: string): string {
    const coord = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    switch (lang?.toLowerCase()) {
      case 'fr':
        return `Lieu sélectionné (${coord})`;
      case 'ar':
        return `الموقع المحدد (${coord})`;
      case 'en':
      default:
        return `Selected location (${coord})`;
    }
  }
}
