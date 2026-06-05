import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicket } from '../../support/entities/support-ticket.entity';
import { SupportAnalyticsService } from './support.service.js';
import { SupportAnalyticsController } from './support.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket])],
  providers: [SupportAnalyticsService],
  controllers: [SupportAnalyticsController],
})
export class SupportAnalyticsModule {}
