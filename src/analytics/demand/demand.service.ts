import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../rides/domain/enums/ride-status.enum';

export interface DemandHotspot {
  city: string;
  lat: number;
  lng: number;
  weight: number;
  rideCount: number;
}

@Injectable()
export class DemandAnalyticsService {
  constructor(
    @InjectRepository(Ride)
    private readonly rideRepository: Repository<Ride>,
  ) {}

  /**
   * Calculate demand hotspots by clustering ride pickup coordinates.
   * Returns top N hotspots with normalized weights (0-1) for heatmap visualization.
   */
  async getDemandHotspots(limit: number = 20): Promise<DemandHotspot[]> {
    // Get rides from the last 7 days with pickup coordinates
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentRides = await this.rideRepository
      .createQueryBuilder('ride')
      .select(['ride.pickupLat', 'ride.pickupLon', 'ride.pickupAddress'])
      .where('ride.pickupLat IS NOT NULL')
      .andWhere('ride.pickupLon IS NOT NULL')
      .andWhere('ride.createdAt >= :sevenDaysAgo', { sevenDaysAgo })
      .andWhere('ride.status IN (:...statuses)', {
        statuses: [
          RideStatus.PENDING,
          RideStatus.SEARCHING_DRIVER,
          RideStatus.ASSIGNED,
          RideStatus.EN_ROUTE_TO_PICKUP,
          RideStatus.ARRIVED,
          RideStatus.IN_TRIP,
          RideStatus.COMPLETED,
        ],
      })
      .getMany();

    console.log(
      `📍 Demand Analytics: Found ${recentRides.length} rides in last 7 days`,
    );
    recentRides.forEach((ride) => {
      console.log(
        `  - Ride: ${ride.pickupAddress} (${ride.pickupLat}, ${ride.pickupLon}) - Status: ${ride.status}`,
      );
    });

    // Cluster rides by approximate location (simple grid clustering)
    const clusters = this.clusterRides(recentRides);

    // Convert clusters to hotspots with normalized weights
    const hotspots: DemandHotspot[] = clusters.map((cluster) => {
      const avgLat =
        cluster.points.reduce((sum, p) => sum + p.lat, 0) /
        cluster.points.length;
      const avgLng =
        cluster.points.reduce((sum, p) => sum + p.lng, 0) /
        cluster.points.length;

      // Extract city name from first address in cluster
      const city = this.extractCityName(cluster.points[0].address);

      return {
        city,
        lat: avgLat,
        lng: avgLng,
        rideCount: cluster.points.length,
        weight: 0, // Will be normalized
      };
    });

    // Normalize weights to 0-1 range
    if (hotspots.length > 0) {
      const maxCount = Math.max(...hotspots.map((h) => h.rideCount));
      hotspots.forEach((h) => {
        h.weight = h.rideCount / maxCount;
      });
    }

    // Sort by weight and return top N
    return hotspots.sort((a, b) => b.weight - a.weight).slice(0, limit);
  }

  /**
   * Cluster rides by approximate location using a simple grid approach.
   * Groups rides within ~0.01 degrees (~1km) of each other.
   */
  private clusterRides(
    rides: Ride[],
  ): Array<{ points: Array<{ lat: number; lng: number; address: string }> }> {
    const clusters: Array<{
      points: Array<{ lat: number; lng: number; address: string }>;
    }> = [];
    const gridSize = 0.01; // ~1km

    for (const ride of rides) {
      if (!ride.pickupLat || !ride.pickupLon) continue;

      const lat = ride.pickupLat;
      const lng = ride.pickupLon;
      const address = ride.pickupAddress || '';

      // Find existing cluster this point belongs to
      let foundCluster = false;
      for (const cluster of clusters) {
        const avgLat =
          cluster.points.reduce((sum, p) => sum + p.lat, 0) /
          cluster.points.length;
        const avgLng =
          cluster.points.reduce((sum, p) => sum + p.lng, 0) /
          cluster.points.length;

        const distance = Math.sqrt(
          Math.pow(lat - avgLat, 2) + Math.pow(lng - avgLng, 2),
        );

        if (distance < gridSize) {
          cluster.points.push({ lat, lng, address });
          foundCluster = true;
          break;
        }
      }

      // Create new cluster if not found
      if (!foundCluster) {
        clusters.push({ points: [{ lat, lng, address }] });
      }
    }

    return clusters;
  }

  /**
   * Extract city name from address string.
   * Simple heuristic: takes the first meaningful word before comma.
   */
  private extractCityName(address: string): string {
    if (!address) return 'Unknown';

    // Remove common prefixes
    const cleaned = address
      .replace(/^(Avenue|Rue|Street|Boulevard|Road|Dr|St|Ave|Blvd)\s*/i, '')
      .trim();

    // Split by comma and take first part
    const parts = cleaned.split(',');
    const firstPart = parts[0].trim();

    // If first part is a number, try second part
    if (/^\d+/.test(firstPart) && parts.length > 1) {
      return parts[1].trim();
    }

    return firstPart || 'Unknown';
  }
}
