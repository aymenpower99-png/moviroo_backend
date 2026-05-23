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
}

@Injectable()
export class GeocodingNominatimService {
  private readonly logger = new Logger(GeocodingNominatimService.name);

  /**
   * Nominatim reverse geocoding (coordinates → address)
   */
  async reverse(lat: number, lon: number, options?: { lang?: string }): Promise<GeocodingResult | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;

      const headers: Record<string, string> = {
        'User-Agent': 'Moviroo-Backend/1.0',
      };
      if (options?.lang) {
        headers['Accept-Language'] = options.lang;
      }

      const res = await withRetry(
        () => fetch(url, { headers }),
        `Nominatim reverse (${lat}, ${lon})`,
        { maxRetries: 2, initialDelayMs: 500 },
        this.logger,
      );

      const data = (await res.json()) as any;

      if (!data || data.error) {
        return null;
      }

      const address = data.address || {};
      return {
        lat: parseFloat(data.lat),
        lon: parseFloat(data.lon),
        display_name: data.display_name || data.name || '',
        address: data.display_name || '',
        city: address.city || address.town || address.village || '',
        country: address.country || 'Tunisia',
        place_type: data.type || data.class || '',
        category: data.class || '',
      };
    } catch (err) {
      this.logger.warn(`Nominatim reverse failed for (${lat}, ${lon}): ${err}`);
      return null;
    }
  }

  /**
   * Nominatim autocomplete
   */
  async autocomplete(query: string, options?: { lang?: string; proximity?: { lat: number; lon: number } }): Promise<GeocodingResult[]> {
    try {
      let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&addressdetails=1&countrycodes=tn`;

      // Add viewbox for proximity bias when coordinates are available
      if (options?.proximity) {
        const { lat, lon } = options.proximity;
        const delta = 0.05; // ~5.5km box
        const minLat = (lat - delta).toFixed(4);
        const maxLat = (lat + delta).toFixed(4);
        const minLon = (lon - delta).toFixed(4);
        const maxLon = (lon + delta).toFixed(4);
        url += `&viewbox=${minLon},${maxLat},${maxLon},${minLat}&bounded=1`;
      }

      const headers: Record<string, string> = {
        'User-Agent': 'Moviroo-Backend/1.0',
      };
      if (options?.lang) {
        headers['Accept-Language'] = options.lang;
      }

      const res = await withRetry(
        () => fetch(url, { headers }),
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
            address: item.display_name || '',
            city: address.city || address.town || address.village || '',
            country: address.country || 'Tunisia',
            place_type: item.type || item.class || '',
            category: item.class || '',
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
