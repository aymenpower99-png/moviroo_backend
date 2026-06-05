import { Controller, Get, Query } from '@nestjs/common';
import { DashboardAnalyticsService } from './dashboard.service.js';

@Controller('analytics/dashboard')
export class DashboardAnalyticsController {
  constructor(private readonly service: DashboardAnalyticsService) {}

  @Get('overview')
  getOverview(@Query('hours') hours?: number) {
    return this.service.getOverview(hours ?? 24);
  }

  @Get('operational-metrics')
  getOperationalMetrics() {
    return this.service.getOperationalMetrics();
  }

  @Get('revenue-trend')
  getRevenueTrend(@Query('days') days?: number) {
    return this.service.getRevenueTrend(days ?? 7);
  }

  @Get('support-resolution')
  getSupportResolutionByHour() {
    return this.service.getSupportResolutionByHour();
  }
}
