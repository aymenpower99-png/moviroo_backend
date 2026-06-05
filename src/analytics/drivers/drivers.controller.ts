import { Controller, Get, Query } from '@nestjs/common';
import { DriversAnalyticsService } from './drivers.service.js';
import { DriverAvailabilityStatus } from '../../driver/entities/driver.entity';

@Controller('analytics/drivers')
export class DriversAnalyticsController {
  constructor(private readonly service: DriversAnalyticsService) {}

  @Get()
  findAll(@Query('status') status?: DriverAvailabilityStatus) {
    return this.service.findAll(status);
  }

  @Get('top')
  getTop(@Query('limit') limit?: number) {
    return this.service.getTopDrivers(limit ?? 10);
  }

  @Get('active-count')
  getActiveCount() {
    return this.service.getActiveCount();
  }

  @Get('status-breakdown')
  getStatusBreakdown() {
    return this.service.getStatusBreakdown();
  }
}
