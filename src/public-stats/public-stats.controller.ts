import { Controller, Get } from '@nestjs/common';
import { PublicStatsService } from './public-stats.service';

@Controller('stats')
export class PublicStatsController {
  constructor(private readonly statsService: PublicStatsService) {}

  @Get('public')
  async getPublicStats() {
    return this.statsService.getPublicStats();
  }
}
