import { Controller, Get, Query } from '@nestjs/common';
import { DemandAnalyticsService } from './demand.service.js';

@Controller('analytics/demand')
export class DemandAnalyticsController {
  constructor(private readonly service: DemandAnalyticsService) {}

  @Get('hotspots')
  getDemandHotspots(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.service.getDemandHotspots(parsedLimit);
  }
}
