import { Injectable, Logger } from '@nestjs/common';
// @ts-ignore - @mapbox/polyline doesn't have TypeScript definitions
const polyline = require('@mapbox/polyline');

export interface SnappingResult {
  snappedLat: number;
  snappedLon: number;
  distanceFromRoute: number; // Distance in meters from GPS to snapped point
  distanceAlongRoute: number; // Distance in meters from route start to snapped point
  isOffRoute: boolean; // True if distance > 70m
}

@Injectable()
export class RouteSnappingService {
  private readonly logger = new Logger(RouteSnappingService.name);

  private readonly SNAP_THRESHOLD = 50; // meters - normal snapping range
  private readonly OFF_ROUTE_THRESHOLD = 70; // meters - off-route detection

  /**
   * Snap GPS point to route polyline
   * Returns snapped coordinates, distance from route, and distance along route
   */
  snapToRoute(
    gpsLat: number,
    gpsLon: number,
    routeGeometry: string,
  ): SnappingResult | null {
    // Decode polyline to coordinates — returns [lat, lng] pairs
    const routeCoordinates = polyline.decode(routeGeometry);
    if (!routeCoordinates || routeCoordinates.length < 2) {
      this.logger.error('[SNAPPING] Invalid route geometry');
      return null;
    }

    // Auto-correct swapped lat/lng: if the first point's "lat" looks like
    // a Tunisian longitude (~7-12) and "lng" looks like a Tunisian latitude
    // (~30-37), the polyline was encoded with [lng, lat] instead of [lat, lng].
    const firstPt = routeCoordinates[0];
    const looksSwapped =
      firstPt[0] >= 5 &&
      firstPt[0] <= 15 &&
      firstPt[1] >= 25 &&
      firstPt[1] <= 40;
    if (looksSwapped) {
      this.logger.warn(
        `[SNAPPING] Detected swapped lat/lng in route geometry — auto-correcting ${routeCoordinates.length} points`,
      );
      for (const coord of routeCoordinates) {
        const tmp = coord[0];
        coord[0] = coord[1];
        coord[1] = tmp;
      }
    }

    // Find closest point on route
    const baseResult = this.findClosestPointOnRoute(
      gpsLat,
      gpsLon,
      routeCoordinates,
    );

    // Determine if off-route
    const isOffRoute = baseResult.distanceFromRoute > this.OFF_ROUTE_THRESHOLD;

    this.logger.log(
      `[SNAPPING] GPS (${gpsLat.toFixed(6)}, ${gpsLon.toFixed(6)}) → Snapped (${baseResult.snappedLat.toFixed(6)}, ${baseResult.snappedLon.toFixed(6)}) - Distance from route: ${baseResult.distanceFromRoute.toFixed(1)}m, Along route: ${baseResult.distanceAlongRoute.toFixed(1)}m, Off-route: ${isOffRoute}`,
    );

    return {
      ...baseResult,
      isOffRoute,
    };
  }

  /**
   * Find closest point on route polyline to GPS point
   * Uses segment-based approach for accuracy
   */
  private findClosestPointOnRoute(
    gpsLat: number,
    gpsLon: number,
    routeCoordinates: number[][],
  ): Omit<SnappingResult, 'isOffRoute'> {
    let minDistance = Infinity;
    let closestLat = routeCoordinates[0][0];
    let closestLon = routeCoordinates[0][1];
    let distanceAlongRoute = 0;

    let accumulatedDistance = 0;

    for (let i = 0; i < routeCoordinates.length - 1; i++) {
      const segmentStart = routeCoordinates[i];
      const segmentEnd = routeCoordinates[i + 1];

      // Find closest point on this segment
      const { point, distance, distanceOnSegment } = this.closestPointOnSegment(
        gpsLat,
        gpsLon,
        segmentStart[0],
        segmentStart[1],
        segmentEnd[0],
        segmentEnd[1],
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestLat = point.lat;
        closestLon = point.lon;
        distanceAlongRoute = accumulatedDistance + distanceOnSegment;
      }

      // Add segment length to accumulated distance
      accumulatedDistance += this.calculateDistance(
        segmentStart[0],
        segmentStart[1],
        segmentEnd[0],
        segmentEnd[1],
      );
    }

    return {
      snappedLat: closestLat,
      snappedLon: closestLon,
      distanceFromRoute: minDistance,
      distanceAlongRoute,
    };
  }

  /**
   * Find closest point on a line segment to a point
   * Returns the closest point, distance, and distance along the segment
   */
  private closestPointOnSegment(
    pointLat: number,
    pointLon: number,
    segmentStartLat: number,
    segmentStartLon: number,
    segmentEndLat: number,
    segmentEndLon: number,
  ): {
    point: { lat: number; lon: number };
    distance: number;
    distanceOnSegment: number;
  } {
    // Convert to meters approximation
    const latToMeters = 111320; // meters per degree latitude
    const lonToMeters = 111320 * Math.cos((pointLat * Math.PI) / 180); // meters per degree longitude

    // Convert to meters
    const px = (pointLon - segmentStartLon) * lonToMeters;
    const py = (pointLat - segmentStartLat) * latToMeters;
    const dx = (segmentEndLon - segmentStartLon) * lonToMeters;
    const dy = (segmentEndLat - segmentStartLat) * latToMeters;

    const segmentLengthSquared = dx * dx + dy * dy;

    // If segment is a point
    if (segmentLengthSquared === 0) {
      return {
        point: { lat: segmentStartLat, lon: segmentStartLon },
        distance: Math.sqrt(px * px + py * py),
        distanceOnSegment: 0,
      };
    }

    // Project point onto line segment
    const t = Math.max(
      0,
      Math.min(1, (px * dx + py * dy) / segmentLengthSquared),
    );

    // Calculate closest point in lat/lon directly using interpolation
    const closestLat = segmentStartLat + t * (segmentEndLat - segmentStartLat);
    const closestLon = segmentStartLon + t * (segmentEndLon - segmentStartLon);

    // Calculate distance
    const distance = Math.sqrt(
      Math.pow((pointLon - closestLon) * lonToMeters, 2) +
        Math.pow((pointLat - closestLat) * latToMeters, 2),
    );

    // Calculate distance along segment
    const distanceOnSegment = t * Math.sqrt(segmentLengthSquared);

    return {
      point: { lat: closestLat, lon: closestLon },
      distance,
      distanceOnSegment,
    };
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
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
}
