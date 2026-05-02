import { Injectable, Logger } from '@nestjs/common';

export interface GpsPoint {
  lat: number;
  lon: number;
  timestamp: Date;
}

@Injectable()
export class GpsSmoothingService {
  private readonly logger = new Logger(GpsSmoothingService.name);

  // GPS history for smoothing (rideId → last N points)
  private gpsHistory = new Map<string, GpsPoint[]>();
  private readonly HISTORY_SIZE = 5; // Keep last 5 GPS points for smoothing
  private readonly MAX_JUMP_DISTANCE = 50; // Maximum allowed jump in meters within 1 second

  /**
   * Smooth GPS point using moving average and spike detection
   * Returns smoothed coordinates or null if GPS is invalid
   */
  smoothGpsPoint(rideId: string, lat: number, lon: number, timestamp: Date): { lat: number; lon: number } | null {
    // Validate GPS coordinates
    if (!this.isValidGps(lat, lon)) {
      this.logger.warn(`[GPS_SMOOTHING] Invalid GPS coordinates: (${lat}, ${lon})`);
      return null;
    }

    // Get history for this ride
    const history = this.gpsHistory.get(rideId) || [];

    // If no history, just add this point and return it
    if (history.length === 0) {
      this.gpsHistory.set(rideId, [{ lat, lon, timestamp }]);
      return { lat, lon };
    }

    // Get last point
    const lastPoint = history[history.length - 1];

    // Check for unrealistic jump
    const distance = this.calculateDistance(lastPoint.lat, lastPoint.lon, lat, lon);
    const timeDiff = (timestamp.getTime() - lastPoint.timestamp.getTime()) / 1000; // seconds

    // If distance > 50m within 1 second, it's likely a GPS spike - ignore it
    if (distance > this.MAX_JUMP_DISTANCE && timeDiff < 1) {
      this.logger.warn(
        `[GPS_SMOOTHING] GPS spike detected for ride ${rideId}: ${distance.toFixed(1)}m in ${timeDiff.toFixed(2)}s - ignoring`,
      );
      // Return last valid point instead of spike
      return { lat: lastPoint.lat, lon: lastPoint.lon };
    }

    // Add new point to history
    history.push({ lat, lon, timestamp });

    // Keep only last N points
    if (history.length > this.HISTORY_SIZE) {
      history.shift();
    }

    this.gpsHistory.set(rideId, history);

    // Apply moving average smoothing
    return this.applyMovingAverage(history);
  }

  /**
   * Clear GPS history for a specific ride
   * Called when trip ends
   */
  clearGpsHistory(rideId: string): void {
    this.gpsHistory.delete(rideId);
    this.logger.log(`[GPS_SMOOTHING] GPS history cleared for ride ${rideId}`);
  }

  /**
   * Clear all GPS histories
   */
  clearAllGpsHistories(): void {
    const count = this.gpsHistory.size;
    this.gpsHistory.clear();
    this.logger.log(`[GPS_SMOOTHING] Cleared ${count} GPS histories`);
  }

  /**
   * Validate GPS coordinates are reasonable
   */
  private isValidGps(lat: number, lon: number): boolean {
    return (
      lat !== null &&
      lat !== undefined &&
      lon !== null &&
      lon !== undefined &&
      !isNaN(lat) &&
      !isNaN(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180 &&
      !(lat === 0 && lon === 0)
    );
  }

  /**
   * Calculate distance between two GPS points (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Apply moving average to GPS points
   */
  private applyMovingAverage(points: GpsPoint[]): { lat: number; lon: number } {
    if (points.length === 0) {
      throw new Error('Cannot apply moving average to empty points array');
    }

    if (points.length === 1) {
      return { lat: points[0].lat, lon: points[0].lon };
    }

    // Calculate average lat and lon
    const avgLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
    const avgLon = points.reduce((sum, p) => sum + p.lon, 0) / points.length;

    return { lat: avgLat, lon: avgLon };
  }
}
