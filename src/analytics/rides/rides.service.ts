import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../rides/domain/enums/ride-status.enum';

@Injectable()
export class RidesAnalyticsService {
  constructor(@InjectRepository(Ride) private repo: Repository<Ride>) {}

  async getStats(from?: string, to?: string) {
    const qb = this.repo.createQueryBuilder('r');
    if (from) qb.andWhere('r.created_at >= :from', { from: new Date(from) });
    if (to) qb.andWhere('r.created_at <= :to', { to: new Date(to) });

    const [total, completed, cancelled, revenue] = await Promise.all([
      qb.clone().getCount(),
      qb.clone().andWhere('r.status = :s', { s: RideStatus.COMPLETED }).getCount(),
      qb.clone().andWhere('r.status = :s', { s: RideStatus.CANCELLED }).getCount(),
      qb
        .clone()
        .andWhere('r.status = :s', { s: RideStatus.COMPLETED })
        .select('COALESCE(SUM(r.price_final), 0)', 'total')
        .getRawOne(),
    ]);

    return {
      total_rides: total,
      completed,
      cancelled,
      completion_rate: total ? ((completed / total) * 100).toFixed(1) : '0',
      total_revenue: parseFloat(revenue?.total || '0'),
    };
  }

  async getRevenueByDay(days = 7) {
    return this.repo
      .createQueryBuilder('r')
      .select("DATE_TRUNC('day', r.created_at)", 'day')
      .addSelect('COUNT(*)', 'rides')
      .addSelect('COALESCE(SUM(r.price_final), 0)', 'revenue')
      .where('r.status = :s', { s: RideStatus.COMPLETED })
      .andWhere('r.created_at >= NOW() - INTERVAL :interval', { interval: `${days} days` })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany();
  }
}
