import { Injectable, Logger } from '@nestjs/common';
import { withRetry } from '../../../../common/utils/retry.util';

export interface GeocodingResult {
  lat: number;
  lon: number;
  display_name: string;
  city: string;
  country: string;
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
  async reverse(lat: number, lon: number): Promise<GeocodingResult | null> {
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

  /**
   * Mapbox autocomplete
   */
  async autocomplete(query: string): Promise<GeocodingResult[]> {
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

  /**
   * Parse Mapbox result into standard format
   */
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
