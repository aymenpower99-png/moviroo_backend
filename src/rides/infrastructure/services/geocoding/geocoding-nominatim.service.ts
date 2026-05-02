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
export class GeocodingNominatimService {
  private readonly logger = new Logger(GeocodingNominatimService.name);

  /**
   * Nominatim autocomplete
   */
  async autocomplete(query: string): Promise<GeocodingResult[]> {
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
