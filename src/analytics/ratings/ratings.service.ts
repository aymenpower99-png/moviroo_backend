import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RideRating } from '../../trips/domain/entities/ride-rating.entity';

@Injectable()
export class RatingsAnalyticsService {
  constructor(@InjectRepository(RideRating) private repo: Repository<RideRating>) {}

  findAll() {
    return this.repo.find({ relations: ['ride'], order: { createdAt: 'DESC' } });
  }

  async getSatisfactionStats() {
    const result = await this.repo
      .createQueryBuilder('r')
      .select('ROUND(AVG(r.passenger_rating)::numeric, 2)', 'avg_passenger_rating')
      .addSelect('ROUND(AVG(r.driver_rating)::numeric, 2)', 'avg_driver_rating')
      .addSelect('COUNT(*)', 'total_ratings')
      .getRawOne();

    const distribution = await this.repo
      .createQueryBuilder('r')
      .select('r.passenger_rating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .where('r.passenger_rating IS NOT NULL')
      .groupBy('r.passenger_rating')
      .orderBy('r.passenger_rating', 'DESC')
      .getRawMany();

    return { ...result, distribution };
  }
}
