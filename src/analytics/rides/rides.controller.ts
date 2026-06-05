import { Controller, Get, Query } from '@nestjs/common';
import { RidesAnalyticsService } from './rides.service.js';

@Controller('analytics/rides')
export class RidesAnalyticsController {
  constructor(private readonly service: RidesAnalyticsService) {}

  @Get('stats')
  getStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getStats(from, to);
  }

  @Get('revenue-by-day')
  getRevenueByDay(@Query('days') days?: number) {
    return this.service.getRevenueByDay(days ?? 7);
  }
}
