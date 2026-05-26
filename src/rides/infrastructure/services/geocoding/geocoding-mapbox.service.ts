import { Injectable, Logger } from '@nestjs/common';
import { withRetry } from '../../../../common/utils/retry.util';

export interface GeocodingResult {
  lat: number;
  lon: number;
  display_name: string;
  address?: string;
  city: string;
  country: string;
  place_type?: string;
  category?: string;
  source?: string;
}

@Injectable()
export class GeocodingMapboxService {
  private readonly logger = new Logger(GeocodingMapboxService.name);

  private readonly MAPBOX_ACCESS_TOKEN =
    process.env.MAPBOX_ACCESS_TOKEN ||
    'pk.eyJ1IjoiYXltb3VuMTEiLCJhIjoiY21vM2JvY3UzMGtrdzJzcXc0cXZwbmE5eiJ9.LcnOY7q-WQ37STLy7wogRA';
  private readonly MAPBOX_BASE_URL =
    'https://api.mapbox.com/geocoding/v5/mapbox.places';

  /**
   * Mapbox forward geocoding (address → coordinates)
   */
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
          `[GEOCODE_MAPBOX] Mapbox forward returned feature without valid center for "${address}"`,
        );
        return null;
      }
      const [centerLon, centerLat] = feature.center;
      if (!this.isValidCoordinate(centerLat, centerLon)) {
        this.logger.warn(
          `[GEOCODE_MAPBOX] Mapbox forward returned invalid coordinates (${centerLat}, ${centerLon}) for "${address}"`,
        );
        return null;
      }
      return this.parseMapboxResult(feature, centerLat, centerLon);
    } catch (err) {
      this.logger.warn(`Forward geocoding failed for "${address}": ${err}`);
      return null;
    }
  }

  /**
   * Mapbox reverse geocoding (coordinates → address)
   */
  async reverse(lat: number, lon: number, options?: { lang?: string }): Promise<GeocodingResult | null> {
    try {
      let url = `${this.MAPBOX_BASE_URL}/${lon},${lat}.json?access_token=${this.MAPBOX_ACCESS_TOKEN}&types=address,poi,neighborhood,locality,place`;
      if (options?.lang) {
        url += `&language=${options.lang}`;
      }

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

      // Pick the most precise result: prefer address/poi over city/neighborhood
      let feature = data.features[0];
      for (const f of data.features) {
        const types = f.place_type || [];
        if (types.includes('address') || types.includes('poi')) {
          feature = f;
          break;
        }
      }

      return this.parseMapboxResult(feature, lat, lon);
    } catch (err) {
      this.logger.warn(
        `Mapbox reverse geocoding failed for (${lat}, ${lon}): ${err}`,
      );
      return null;
    }
  }

  /**
   * Mapbox autocomplete
   */
  async autocomplete(query: string, options?: { proximity?: { lat: number; lon: number }; lang?: string }): Promise<GeocodingResult[]> {
    try {
      let url = `${this.MAPBOX_BASE_URL}/${encodeURIComponent(query)}.json?access_token=${this.MAPBOX_ACCESS_TOKEN}&autocomplete=true&limit=10&country=tn&types=poi,address,place,locality,neighborhood`;
      if (options?.proximity) {
        url += `&proximity=${options.proximity.lon},${options.proximity.lat}`;
      }
      if (options?.lang) {
        url += `&language=${options.lang}`;
      }

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

  /**
   * Mapbox nearby places (reverse geocoding with POI types)
   */
  async nearby(lat: number, lon: number, options?: { lang?: string }): Promise<GeocodingResult[]> {
    try {
      let url = `${this.MAPBOX_BASE_URL}/${lon},${lat}.json?access_token=${this.MAPBOX_ACCESS_TOKEN}&types=poi,address,neighborhood,locality,place&limit=10`;
      if (options?.lang) {
        url += `&language=${options.lang}`;
      }

      const res = await withRetry(
        () => fetch(url),
        `Mapbox nearby (${lat}, ${lon})`,
        { maxRetries: 2, initialDelayMs: 500 },
        this.logger,
      );

      const data = (await res.json()) as any;

      if (!data.features || data.features.length === 0) {
        return [];
      }

      return data.features
        .map((feature: any) => {
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
      this.logger.warn(`Mapbox nearby failed for (${lat}, ${lon}): ${err}`);
      return [];
    }
  }

  /**
   * Build a clean localized display_name from Mapbox feature.
   * Uses structured context to build address without mixed languages.
   */
  private buildMapboxDisplayName(feature: any): string {
    const text = feature.text || '';
    const context = feature.context || [];

    const parts: string[] = [];
    if (text) {
      parts.push(text);
    }

    // Extract useful context layers (exclude country, region)
    const usefulTypes = ['neighborhood', 'locality', 'place', 'district'];
    for (const ctx of context) {
      const ctxId = ctx.id || '';
      const ctxText = ctx.text || '';
      // Skip country and region-level admin
      if (ctxId.includes('country')) continue;
      if (ctxId.includes('region')) continue;
      if (usefulTypes.some((t) => ctxId.includes(t))) {
        if (ctxText && !parts.some((p) => p.toLowerCase() === ctxText.toLowerCase())) {
          parts.push(ctxText);
        }
      }
    }

    return parts.join(', ');
  }

  /**
   * Parse Mapbox result into standard format
   */
  private parseMapboxResult(
    feature: any,
    lat: number,
    lon: number,
  ): GeocodingResult {
    const placeName = feature.text || feature.place_name || '';
    const fullContext = feature.place_name || placeName;
    const context = feature.context || [];

    // Extract city from context
    const cityContext = context.find(
      (c: any) => c.id.includes('place') || c.id.includes('locality'),
    );
    const city = cityContext?.text || '';

    // Extract country from context
    const countryContext = context.find((c: any) => c.id.includes('country'));
    const country = countryContext?.text || 'Tunisia';

    // Extract place type and category for icon mapping
    const placeType = Array.isArray(feature.place_type)
      ? feature.place_type.join(',')
      : '';
    const category = feature.properties?.category || '';

    // Build clean localized display name
    const localizedName = this.buildMapboxDisplayName(feature);

    return {
      lat,
      lon,
      display_name: localizedName || placeName,
      address: localizedName || fullContext,
      city,
      country,
      place_type: placeType,
      category,
      source: 'mapbox',
    };
  }

  /**
   * Validate coordinates: not (0,0), not NaN, in valid range
   */
  private isValidCoordinate(lat: number, lon: number): boolean {
    if (lat === null || lat === undefined || lon === null || lon === undefined)
      return false;
    if (isNaN(lat) || isNaN(lon)) return false;
    if (lat === 0 && lon === 0) return false; // Reject (0,0) - usually a fallback
    if (lat < -90 || lat > 90) return false;
    if (lon < -180 || lon > 180) return false;
    return true;
  }
}
