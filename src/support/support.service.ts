import {
  ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket, TicketStatus } from './entities/support-ticket.entity';
import { TicketMessage } from './entities/ticket-message.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket)
    private ticketRepo: Repository<SupportTicket>,
    @InjectRepository(TicketMessage)
    private messageRepo: Repository<TicketMessage>,
  ) {}

  // ── User: create a ticket ──────────────────────────────────────────────────
  async createTicket(dto: CreateTicketDto, authorId: string): Promise<SupportTicket> {
    const ticket = this.ticketRepo.create({ ...dto, authorId, status: TicketStatus.OPEN });
    return this.ticketRepo.save(ticket);
  }

  // ── User: list own tickets ─────────────────────────────────────────────────
  async listMyTickets(authorId: string, page = 1, limit = 20) {
    const [data, total] = await this.ticketRepo.findAndCount({
      where: { authorId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  // ── User: get one ticket (must be owner) ──────────────────────────────────
  async getMyTicket(ticketId: string, userId: string): Promise<SupportTicket> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId },
      relations: ['messages', 'messages.sender'],
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.authorId !== userId) throw new ForbiddenException();
    return ticket;
  }

  // ── User: add a reply to own ticket ────────────────────────────────────────
  async replyToTicket(ticketId: string, dto: ReplyTicketDto, senderId: string): Promise<TicketMessage> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.authorId !== senderId) throw new ForbiddenException();
    if (ticket.status === TicketStatus.RESOLVED) throw new ForbiddenException('Ticket is resolved');

    const message = this.messageRepo.create({ body: dto.body, senderId, ticketId });
    const saved = await this.messageRepo.save(message);

    // user replied → move back to IN_PROGRESS if was waiting
    if (ticket.status === TicketStatus.WAITING_FOR_USER) {
      await this.ticketRepo.update(ticketId, { status: TicketStatus.IN_PROGRESS });
    }
    return saved;
  }

  // ── Admin: list all tickets (with optional status filter) ─────────────────
  // FIX: use QueryBuilder to join author manually — avoids the
  // "Property 'author' was not found in SupportTicket" TypeORM bug
  // that occurs when the FK column name (author_id) differs from the
  // relation property name (author) in older TypeORM versions.
  async adminListTickets(page = 1, limit = 20, status?: TicketStatus) {
    const qb = this.ticketRepo
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.author', 'author')
      .orderBy('ticket.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) {
      qb.where('ticket.status = :status', { status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  // ── Admin: get full ticket with messages ──────────────────────────────────
  async adminGetTicket(ticketId: string): Promise<SupportTicket> {
    const ticket = await this.ticketRepo
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.author', 'author')
      .leftJoinAndSelect('ticket.assignedAdmin', 'assignedAdmin')
      .leftJoinAndSelect('ticket.messages', 'messages')
      .leftJoinAndSelect('messages.sender', 'sender')
      .where('ticket.id = :id', { id: ticketId })
      .getOne();

    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  // ── Admin: reply to a ticket ──────────────────────────────────────────────
  async adminReply(ticketId: string, dto: ReplyTicketDto, adminId: string): Promise<TicketMessage> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === TicketStatus.RESOLVED) throw new ForbiddenException('Ticket is already resolved');

    const message = this.messageRepo.create({ body: dto.body, senderId: adminId, ticketId });
    const saved = await this.messageRepo.save(message);

    // first admin reply → IN_PROGRESS; subsequent → WAITING_FOR_USER
    const newStatus =
      ticket.status === TicketStatus.OPEN ? TicketStatus.IN_PROGRESS : TicketStatus.WAITING_FOR_USER;
    await this.ticketRepo.update(ticketId, {
      status: newStatus,
      assignedAdminId: adminId,
    });
    return saved;
  }

  // ── Admin: update status manually ─────────────────────────────────────────
  async adminUpdateStatus(ticketId: string, dto: UpdateTicketStatusDto, adminId: string): Promise<SupportTicket> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const updates: Partial<SupportTicket> = { status: dto.status, assignedAdminId: adminId };
    if (dto.status === TicketStatus.RESOLVED) {
      updates.resolvedAt = new Date();
    }
    await this.ticketRepo.update(ticketId, updates);
    return this.ticketRepo.findOneOrFail({ where: { id: ticketId } });
  }

  // ── Admin: assign ticket to self ──────────────────────────────────────────
  async adminAssign(ticketId: string, adminId: string): Promise<SupportTicket> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    await this.ticketRepo.update(ticketId, { assignedAdminId: adminId });
    return this.ticketRepo.findOneOrFail({ where: { id: ticketId } });
  }
}