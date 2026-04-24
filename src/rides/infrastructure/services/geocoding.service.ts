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
  source: 'mapbox' | 'nominatim';
  confidence: number; // 0-1 score indicating location accuracy
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

  // Nominatim configuration
  private readonly NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

  /** Calculate confidence score for a geocoding result (0-1) */
  private calculateConfidence(
    source: 'mapbox' | 'nominatim',
    result: Partial<GeocodingResult>,
    isFallback: boolean = false,
  ): number {
    let confidence = 0;

    // Base score based on source (Mapbox is more reliable)
    if (source === 'mapbox') {
      confidence += 0.7; // Base 0.7 for Mapbox
    } else {
      confidence += 0.5; // Base 0.5 for Nominatim
    }

    // Deduct for fallback results
    if (isFallback) {
      confidence -= 0.3;
    }

    // Add points for data completeness
    if (result.city && result.city !== 'Unknown') confidence += 0.1;
    if (result.country && result.country !== 'Unknown') confidence += 0.1;
    if (result.display_name && result.display_name.length > 10)
      confidence += 0.1;

    // Clamp to 0-1 range
    return Math.max(0, Math.min(1, confidence));
  }

  /** Address → coordinates (forward geocoding) */
  async forward(address: string): Promise<GeocodingResult | null> {
    try {
      const url = `${this.NOMINATIM_BASE_URL}/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Moviroo/1.0' },
      });
      const data = (await res.json()) as any[];
      if (!data.length) return null;
      return this.parseNominatimResult(data[0]);
    } catch (err) {
      this.logger.warn(`Forward geocoding failed for "${address}": ${err}`);
      return null;
    }
  }

  /** Coordinates → address (reverse geocoding with fallback) - CACHED */
  async reverse(lat: number, lon: number): Promise<GeocodingResult | null> {
    const startTime = Date.now();
    this.logger.log(`[GEOCODE] Reverse geocoding request: (${lat}, ${lon})`);

    // Check cache first
    const cacheKey = `reverse_geocode:${lat.toFixed(6)}:${lon.toFixed(6)}`;
    const cached = await this.cacheManager.get<GeocodingResult>(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      this.logger.log(
        `[GEOCODE] Cache HIT for reverse geocoding: (${lat}, ${lon}) - ${duration}ms`,
      );
      return cached;
    }

    // Try Mapbox first
    const mapboxStart = Date.now();
    const mapboxResult = await this.reverseMapbox(lat, lon);
    const mapboxDuration = Date.now() - mapboxStart;

    if (mapboxResult && this.isResultComplete(mapboxResult)) {
      const totalDuration = Date.now() - startTime;
      this.logger.log(
        `[GEOCODE] Reverse geocoding via Mapbox: (${lat}, ${lon}) - ${totalDuration}ms (Mapbox: ${mapboxDuration}ms)`,
      );
      await this.cacheManager.set(cacheKey, mapboxResult, 600); // 10 minutes
      return mapboxResult;
    }

    // Fallback to Nominatim
    this.logger.warn(
      `[GEOCODE] Mapbox result incomplete or failed, falling back to Nominatim for (${lat}, ${lon})`,
    );
    const nominatimStart = Date.now();
    const nominatimResult = await this.reverseNominatim(lat, lon);
    const nominatimDuration = Date.now() - nominatimStart;

    if (nominatimResult) {
      const totalDuration = Date.now() - startTime;
      this.logger.log(
        `[GEOCODE] Reverse geocoding via Nominatim: (${lat}, ${lon}) - ${totalDuration}ms (Nominatim: ${nominatimDuration}ms)`,
      );
      await this.cacheManager.set(cacheKey, nominatimResult, 600); // 10 minutes
      return nominatimResult;
    }

    // Safe fallback: return minimal result with coordinates
    this.logger.error(
      `[GEOCODE] Both geocoding services failed, using safe fallback for (${lat}, ${lon})`,
    );
    const safeResult: GeocodingResult = {
      lat,
      lon,
      display_name: `Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
      city: 'Unknown',
      country: 'Tunisia',
      source: 'nominatim', // Mark as nominatim for consistency
      confidence: this.calculateConfidence(
        'nominatim',
        {
          lat,
          lon,
          display_name: `Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
          city: 'Unknown',
          country: 'Tunisia',
        },
        true,
      ), // isFallback = true
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

  /** Nominatim reverse geocoding (fallback) */
  private async reverseNominatim(
    lat: number,
    lon: number,
  ): Promise<GeocodingResult | null> {
    try {
      const url = `${this.NOMINATIM_BASE_URL}/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;

      const res = await withRetry(
        () => fetch(url, { headers: { 'User-Agent': 'Moviroo/1.0' } }),
        `Nominatim reverse geocoding (${lat}, ${lon})`,
        { maxRetries: 2, initialDelayMs: 500 },
        this.logger,
      );

      const data = (await res.json()) as any;

      if (!data || data.error) {
        return null;
      }

      return this.parseNominatimResult(data);
    } catch (err) {
      this.logger.warn(
        `Nominatim reverse geocoding failed for (${lat}, ${lon}): ${err}`,
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
      source: 'mapbox',
      confidence: this.calculateConfidence('mapbox', {
        lat,
        lon,
        display_name: placeName,
        city,
        country,
      }),
    };
  }

  /** Parse Nominatim result into standard format */
  private parseNominatimResult(data: any): GeocodingResult {
    const address = data.address || {};
    const lat = parseFloat(data.lat);
    const lon = parseFloat(data.lon);

    const display_name = data.display_name || '';
    const city =
      address.city || address.town || address.village || address.suburb || '';
    const country = address.country || 'Tunisia';

    return {
      lat,
      lon,
      display_name,
      city,
      country,
      source: 'nominatim',
      confidence: this.calculateConfidence('nominatim', {
        lat,
        lon,
        display_name,
        city,
        country,
      }),
    };
  }

  /** Check if result is complete enough to use */
  private isResultComplete(result: GeocodingResult): boolean {
    return !!result.display_name && result.display_name.length > 3;
  }

  /** Unified autocomplete - queries both Mapbox and Nominatim in parallel - CACHED */
  async autocomplete(query: string): Promise<GeocodingResult[]> {
    const startTime = Date.now();
    this.logger.log(`[GEOCODE] Autocomplete request: "${query}"`);

    if (!query || query.trim().length < 2) {
      this.logger.warn(`[GEOCODE] Autocomplete query too short: "${query}"`);
      return [];
    }

    // Check cache first
    const cacheKey = `autocomplete:${query.trim().toLowerCase()}`;
    const cached = await this.cacheManager.get<GeocodingResult[]>(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      this.logger.log(
        `[GEOCODE] Cache HIT for autocomplete: "${query}" - ${duration}ms - ${cached.length} results`,
      );
      return cached;
    }

    // Query both APIs in parallel
    const parallelStart = Date.now();
    const [mapboxResults, nominatimResults] = await Promise.allSettled([
      this.autocompleteMapbox(query),
      this.autocompleteNominatim(query),
    ]);
    const parallelDuration = Date.now() - parallelStart;

    const mapboxData =
      mapboxResults.status === 'fulfilled' ? mapboxResults.value : [];
    const nominatimData =
      nominatimResults.status === 'fulfilled' ? nominatimResults.value : [];

    this.logger.log(
      `[GEOCODE] Autocomplete API results for "${query}" - Mapbox: ${mapboxData.length}, Nominatim: ${nominatimData.length} - ${parallelDuration}ms`,
    );

    // Merge and deduplicate results
    const dedupStart = Date.now();
    const mergedResults = this.deduplicateResults([
      ...mapboxData,
      ...nominatimData,
    ]);
    const dedupDuration = Date.now() - dedupStart;

    const results = mergedResults.slice(0, 10); // Return top 10 results
    await this.cacheManager.set(cacheKey, results, 300); // 5 minutes

    const totalDuration = Date.now() - startTime;
    this.logger.log(
      `[GEOCODE] Autocomplete complete: "${query}" - ${totalDuration}ms (API: ${parallelDuration}ms, Dedup: ${dedupDuration}ms) - ${results.length} final results`,
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

  /** Nominatim autocomplete */
  private async autocompleteNominatim(
    query: string,
  ): Promise<GeocodingResult[]> {
    try {
      const url = `${this.NOMINATIM_BASE_URL}/search?q=${encodeURIComponent(query)}&format=json&limit=10&addressdetails=1&countrycodes=tn`;

      const res = await withRetry(
        () => fetch(url, { headers: { 'User-Agent': 'Moviroo/1.0' } }),
        `Nominatim autocomplete "${query}"`,
        { maxRetries: 2, initialDelayMs: 500 },
        this.logger,
      );

      const data = (await res.json()) as any[];

      if (!data || data.length === 0) {
        return [];
      }

      return data.map((item: any) => this.parseNominatimResult(item));
    } catch (err) {
      this.logger.warn(`Nominatim autocomplete failed for "${query}": ${err}`);
      return [];
    }
  }

  /** Deduplicate results using distance + name similarity */
  private deduplicateResults(results: GeocodingResult[]): GeocodingResult[] {
    const deduplicated: GeocodingResult[] = [];
    const DISTANCE_THRESHOLD = 0.0005; // ~50 meters in degrees
    const NAME_SIMILARITY_THRESHOLD = 0.85;

    for (const result of results) {
      let isDuplicate = false;

      for (const existing of deduplicated) {
        // Check distance
        const distance = this.calculateDistance(
          result.lat,
          result.lon,
          existing.lat,
          existing.lon,
        );
        if (distance > DISTANCE_THRESHOLD) continue;

        // Check name similarity
        const similarity = this.calculateNameSimilarity(
          result.display_name,
          existing.display_name,
        );
        if (similarity >= NAME_SIMILARITY_THRESHOLD) {
          // Prefer Mapbox over Nominatim when duplicates exist
          if (existing.source === 'nominatim' && result.source === 'mapbox') {
            // Replace Nominatim with Mapbox
            const index = deduplicated.indexOf(existing);
            deduplicated[index] = result;
          }
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        deduplicated.push(result);
      }
    }

    this.logger.log(
      `Deduplicated ${results.length} results to ${deduplicated.length} unique results`,
    );
    return deduplicated;
  }

  /** Calculate distance between two coordinates (Haversine formula in degrees) */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /** Calculate name similarity using Levenshtein distance */
  private calculateNameSimilarity(name1: string, name2: string): number {
    const s1 = name1.toLowerCase().trim();
    const s2 = name2.toLowerCase().trim();

    if (s1 === s2) return 1.0;

    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1.0;

    const distance = this.levenshteinDistance(s1, s2);
    return 1 - distance / maxLength;
  }

  /** Levenshtein distance algorithm */
  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, // deletion
          dp[i][j - 1] + 1, // insertion
          dp[i - 1][j - 1] + cost, // substitution
        );
      }
    }

    return dp[m][n];
  }
}
