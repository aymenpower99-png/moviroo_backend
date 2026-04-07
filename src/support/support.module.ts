import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicket } from './entities/support-ticket.entity';
import { TicketMessage } from './entities/ticket-message.entity';
import { SupportService } from './support.service';
import { SupportUserController, SupportAdminController } from './support.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket, TicketMessage])],
  controllers: [SupportUserController, SupportAdminController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
