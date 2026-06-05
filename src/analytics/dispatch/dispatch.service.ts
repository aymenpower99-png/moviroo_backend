import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DispatchOffer } from '../../dispatch/domain/entities/dispatch-offer.entity';
import { OfferStatus } from '../../dispatch/domain/enums/offer-status.enum';

@Injectable()
export class DispatchAnalyticsService {
  constructor(@InjectRepository(DispatchOffer) private repo: Repository<DispatchOffer>) {}

  findAll(status?: OfferStatus) {
    const where: any = {};
    if (status) where.status = status;
    return this.repo.find({ where, relations: ['driver', 'ride'], order: { createdAt: 'DESC' }, take: 100 });
  }

  findByRide(rideId: string) {
    return this.repo.find({ where: { rideId }, relations: ['driver'], order: { score: 'DESC' } });
  }

  async getDispatchStats() {
    return this.repo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('ROUND(AVG(o.distance_to_pickup_km), 2)', 'avg_distance_km')
      .groupBy('o.status')
      .getRawMany();
  }
}
