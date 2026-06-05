import { Controller, Get, Param, Query } from '@nestjs/common';
import { DispatchAnalyticsService } from './dispatch.service.js';
import { OfferStatus } from '../../dispatch/domain/enums/offer-status.enum';

@Controller('analytics/dispatch')
export class DispatchAnalyticsController {
  constructor(private readonly service: DispatchAnalyticsService) {}

  @Get('offers')
  findAll(@Query('status') status?: OfferStatus) {
    return this.service.findAll(status);
  }

  @Get('offers/stats')
  getStats() {
    return this.service.getDispatchStats();
  }

  @Get('offers/ride/:rideId')
  findByRide(@Param('rideId') rideId: string) {
    return this.service.findByRide(rideId);
  }
}
