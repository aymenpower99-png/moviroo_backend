import { Controller, Get } from '@nestjs/common';
import { VehiclesAnalyticsService } from './vehicles.service.js';

@Controller('analytics/vehicles')
export class VehiclesAnalyticsController {
  constructor(private readonly service: VehiclesAnalyticsService) {}

  @Get('stats')
  getFleetStats() {
    return this.service.getFleetStats();
  }
}
