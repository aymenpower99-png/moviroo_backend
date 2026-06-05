import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PassengerEntity, MembershipLevel } from '../../passenger/entities/passengers.entity';

@Injectable()
export class PassengersAnalyticsService {
  constructor(@InjectRepository(PassengerEntity) private repo: Repository<PassengerEntity>) {}

  findAll() {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async getMembershipStats() {
    return this.repo
      .createQueryBuilder('p')
      .select('p.membership_level', 'level')
      .addSelect('COUNT(*)', 'count')
      .addSelect('AVG(p.membership_points)', 'avg_points')
      .groupBy('p.membership_level')
      .getRawMany();
  }
}
