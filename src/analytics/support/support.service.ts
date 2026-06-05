import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket, TicketStatus, TicketCategory } from '../../support/entities/support-ticket.entity';

@Injectable()
export class SupportAnalyticsService {
  constructor(@InjectRepository(SupportTicket) private ticketRepo: Repository<SupportTicket>) {}

  findAll(status?: TicketStatus, category?: TicketCategory) {
    const where: any = {};
    if (status) where.status = status;
    if (category) where.category = category;
    return this.ticketRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getStats() {
    const [total, open, resolved] = await Promise.all([
      this.ticketRepo.count(),
      this.ticketRepo.count({ where: { status: TicketStatus.OPEN } }),
      this.ticketRepo.count({ where: { status: TicketStatus.RESOLVED } }),
    ]);

    const byCategory = await this.ticketRepo
      .createQueryBuilder('t')
      .select('t.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.category')
      .getRawMany();

    const byHour = await this.ticketRepo
      .createQueryBuilder('t')
      .select("DATE_TRUNC('hour', t.created_at)", 'hour')
      .addSelect("COUNT(*) FILTER (WHERE t.status = 'resolved')", 'resolved')
      .addSelect("COUNT(*) FILTER (WHERE t.status = 'open' OR t.status = 'in_progress')", 'pending')
      .where("t.created_at >= NOW() - INTERVAL '24 hours'")
      .groupBy('DATE_TRUNC(\'hour\', t.created_at)')
      .orderBy('DATE_TRUNC(\'hour\', t.created_at)', 'ASC')
      .getRawMany();

    return { total, open, resolved, resolution_rate: total ? ((resolved / total) * 100).toFixed(1) : '0', by_category: byCategory, by_hour: byHour };
  }
}
