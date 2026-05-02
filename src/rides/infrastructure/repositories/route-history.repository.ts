import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RouteHistory } from '../../domain/entities/route-history.entity';

@Injectable()
export class RouteHistoryRepository {
  constructor(
    @InjectRepository(RouteHistory)
    private readonly repo: Repository<RouteHistory>,
  ) {}

  async saveRoute(
    rideId: string,
    routeGeometry: string,
    routeDistanceMeters: number,
    routeDurationSeconds: number,
    sequenceNumber: number,
  ): Promise<RouteHistory> {
    const routeHistory = this.repo.create({
      rideId,
      routeGeometry,
      routeDistanceMeters,
      routeDurationSeconds,
      sequenceNumber,
    });
    return this.repo.save(routeHistory);
  }

  async findByRideId(rideId: string): Promise<RouteHistory[]> {
    return this.repo.find({
      where: { rideId },
      order: { sequenceNumber: 'ASC' },
    });
  }

  async findByRideIdAndSequence(
    rideId: string,
    sequenceNumber: number,
  ): Promise<RouteHistory | null> {
    return this.repo.findOne({
      where: { rideId, sequenceNumber },
    });
  }
}
