import { Injectable } from '@nestjs/common';

@Injectable()
export class HaversineService {
  private static readonly EARTH_RADIUS_KM = 6371;
  private static readonly AVG_SPEED_KMH = 40;

  /**
   * Straight-line distance + rough duration estimate.
   * Used as fallback when ML API is unreachable.
   */
  calculate(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): { distanceKm: number; durationMin: number } {
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distanceKm = +(
      HaversineService.EARTH_RADIUS_KM * c
    ).toFixed(2);
    const durationMin = +(
      (distanceKm / HaversineService.AVG_SPEED_KMH) * 60
    ).toFixed(1);

    return { distanceKm, durationMin };
  }
}
