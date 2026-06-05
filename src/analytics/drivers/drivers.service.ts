import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Driver, DriverAvailabilityStatus } from '../../driver/entities/driver.entity';

@Injectable()
export class DriversAnalyticsService {
  constructor(@InjectRepository(Driver) private repo: Repository<Driver>) {}

  findAll(status?: DriverAvailabilityStatus) {
    const where: any = {};
    if (status) where.availabilityStatus = status;
    return this.repo.find({ where, relations: ['user'], order: { createdAt: 'DESC' } });
  }

  async getTopDrivers(limit = 10) {
    return this.repo.find({ relations: ['user'], order: { ratingAverage: 'DESC', totalTrips: 'DESC' }, take: limit });
  }

  async getActiveCount() {
    return this.repo.count({ where: { availabilityStatus: DriverAvailabilityStatus.ONLINE } });
  }

  async getStatusBreakdown() {
    return this.repo
      .createQueryBuilder('d')
      .select('d.availability_status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('d.availability_status')
      .getRawMany();
  }
}
