import { Controller, Get } from '@nestjs/common';
import { PassengersAnalyticsService } from './passengers.service.js';

@Controller('analytics/passengers')
export class PassengersAnalyticsController {
  constructor(private readonly service: PassengersAnalyticsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('membership-stats')
  getMembershipStats() {
    return this.service.getMembershipStats();
  }
}
