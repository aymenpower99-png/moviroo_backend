import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatchOffer } from '../../dispatch/domain/entities/dispatch-offer.entity';
import { DispatchAnalyticsService } from './dispatch.service.js';
import { DispatchAnalyticsController } from './dispatch.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([DispatchOffer])],
  providers: [DispatchAnalyticsService],
  controllers: [DispatchAnalyticsController],
})
export class DispatchAnalyticsModule {}
