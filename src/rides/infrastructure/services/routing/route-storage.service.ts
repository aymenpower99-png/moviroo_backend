import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ride } from '../../../domain/entities/ride.entity';

@Injectable()
export class RouteStorageService {
  private readonly logger = new Logger(RouteStorageService.name);

  constructor(
    @InjectRepository(Ride) private readonly rideRepo: Repository<Ride>,
  ) {}

  /**
   * Store route data in Ride entity
   * Called when trip starts or when re-routing happens
   */
  async storeRouteInRide(
    rideId: string,
    routeGeometry: string,
    routeDistanceMeters: number,
    routeDurationSeconds: number,
  ): Promise<void> {
    this.logger.log(
      `[ROUTE_STORAGE] Storing route in ride ${rideId}: ${routeDistanceMeters.toFixed(0)}m, ${routeDurationSeconds.toFixed(0)}s`,
    );

    try {
      await this.rideRepo.update(rideId, {
        routeGeometry,
        routeDistanceMeters,
        routeDurationSeconds,
      });
      this.logger.log(`[ROUTE_STORAGE] Route stored successfully in ride ${rideId}`);
    } catch (err) {
      this.logger.error(
        `[ROUTE_STORAGE] Failed to store route in ride ${rideId}: ${err}`,
      );
      throw err;
    }
  }
}
