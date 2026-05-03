import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TripWaypoint } from '../domain/entities/trip-waypoint.entity';

/**
 * Handler for GPS buffer management
 */
export class TripBufferHandler {
  private readonly logger = new Logger(TripBufferHandler.name);

  constructor(
    private readonly waypointRepo: Repository<TripWaypoint>,
    private readonly gpsBuffer: Map<string, Partial<TripWaypoint>[]>,
    private readonly sequenceCounters: Map<string, number>,
    private readonly progressCache: Map<string, { data: any; timestamp: number }>,
  ) {}

  /**
   * Flush buffer to database
   */
  async flushBuffer(rideId: string): Promise<void> {
    const buffer = this.gpsBuffer.get(rideId);
    if (!buffer || buffer.length === 0) return;

    try {
      await this.waypointRepo
        .createQueryBuilder()
        .insert()
        .into(TripWaypoint)
        .values(buffer as any)
        .execute();

      this.logger.debug(
        `Flushed ${buffer.length} waypoints for ride ${rideId}`,
      );
    } catch (err) {
      this.logger.error(`Failed to flush waypoints: ${err}`);
    }

    this.gpsBuffer.set(rideId, []);
  }

  /**
   * Flush all remaining buffers (called by use-cases on trip end)
   */
  async flushAll(rideId: string): Promise<void> {
    await this.flushBuffer(rideId);
    this.gpsBuffer.delete(rideId);
    this.sequenceCounters.delete(rideId);
    this.progressCache.delete(rideId); // Clear progress cache
  }
}
