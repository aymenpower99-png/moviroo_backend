import { Controller, Get } from '@nestjs/common';
import { RatingsAnalyticsService } from './ratings.service.js';

@Controller('analytics/ratings')
export class RatingsAnalyticsController {
  constructor(private readonly service: RatingsAnalyticsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('stats')
  getStats() {
    return this.service.getSatisfactionStats();
  }
}
