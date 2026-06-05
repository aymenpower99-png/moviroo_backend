import { Controller, Get, Query } from '@nestjs/common';
import { SupportAnalyticsService } from './support.service.js';
import {
  TicketStatus,
  TicketCategory,
} from '../../support/entities/support-ticket.entity';

@Controller('analytics/support')
export class SupportAnalyticsController {
  constructor(private readonly service: SupportAnalyticsService) {}

  @Get('tickets')
  findAll(
    @Query('status') status?: TicketStatus,
    @Query('category') category?: TicketCategory,
  ) {
    return this.service.findAll(status, category);
  }

  @Get('tickets/stats')
  getStats() {
    return this.service.getStats();
  }
}
