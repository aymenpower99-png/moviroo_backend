import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';

@Injectable()
export class VehiclesAnalyticsService {
  constructor(@InjectRepository(Vehicle) private repo: Repository<Vehicle>) {}

  async getFleetStats() {
    const result = await this.repo
      .createQueryBuilder('v')
      .select('v.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('v.status')
      .getRawMany();
    const total = await this.repo.count();
    return { total, by_status: result };
  }
}
