import { Injectable, Logger } from '@nestjs/common';

export interface GeocodingResult {
  lat: number;
  lon: number;
  displayName: string;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly BASE_URL = 'https://nominatim.openstreetmap.org';

  /** Address → coordinates */
  async forward(address: string): Promise<GeocodingResult | null> {
    try {
      const url = `${this.BASE_URL}/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Moviroo/1.0' },
      });
      const data = (await res.json()) as any[];
      if (!data.length) return null;
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name,
      };
    } catch (err) {
      this.logger.warn(`Forward geocoding failed for "${address}": ${err}`);
      return null;
    }
  }

  /** Coordinates → address */
  async reverse(lat: number, lon: number): Promise<string | null> {
    try {
      const url = `${this.BASE_URL}/reverse?lat=${lat}&lon=${lon}&format=json`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Moviroo/1.0' },
      });
      const data = (await res.json()) as any;
      return data.display_name ?? null;
    } catch (err) {
      this.logger.warn(`Reverse geocoding failed for (${lat}, ${lon}): ${err}`);
      return null;
    }
  }
}
