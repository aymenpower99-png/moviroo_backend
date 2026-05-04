import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicket } from './entities/support-ticket.entity';
import { TicketMessage } from './entities/ticket-message.entity';
import { User } from '../users/entites/user.entity';
import { SupportService } from './support.service';
import { SupportGateway } from './support.gateway';
import {
  SupportUserController,
  SupportAdminController,
} from './support.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket, TicketMessage, User])],
  controllers: [SupportUserController, SupportAdminController],
  providers: [SupportService, SupportGateway],
})
export class SupportModule {}
