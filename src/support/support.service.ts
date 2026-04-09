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
import { User } from '../users/entites/user.entity';

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket)
    private ticketRepo: Repository<SupportTicket>,
    @InjectRepository(TicketMessage)
    private messageRepo: Repository<TicketMessage>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  // ── helpers ────────────────────────────────────────────────────────────────
  private async enrichTicketWithAuthorAndMessages(ticket: SupportTicket) {
    // fetch messages for this ticket
    const messages = await this.messageRepo.find({
      where: { ticketId: ticket.id },
      order: { createdAt: 'ASC' },
    });

    // collect all unique user IDs (author + senders)
    const userIds = [
      ticket.authorId,
      ...messages.map(m => m.senderId),
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    const users = userIds.length
      ? await this.userRepo
          .createQueryBuilder('u')
          .select(['u.id', 'u.firstName', 'u.lastName', 'u.email', 'u.role', 'u.phone'])
          .where('u.id IN (:...ids)', { ids: userIds })
          .getMany()
      : [];

    const userById = new Map(users.map(u => [u.id, u]));
    const author   = userById.get(ticket.authorId) ?? null;

    return {
      ...ticket,
      author: author
        ? {
            id:        author.id,
            firstName: (author as any).firstName ?? '',
            lastName:  (author as any).lastName  ?? '',
            email:     (author as any).email     ?? '',
            phone:     (author as any).phone     ?? '',
            role:      (author as any).role      ?? '',
          }
        : null,
      messages: messages.map(m => {
        const sender = userById.get(m.senderId) ?? null;
        return {
          ...m,
          sender: sender
            ? {
                id:        sender.id,
                firstName: (sender as any).firstName ?? '',
                lastName:  (sender as any).lastName  ?? '',
                email:     (sender as any).email     ?? '',
              }
            : null,
        };
      }),
    };
  }

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
  async getMyTicket(ticketId: string, userId: string) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.authorId !== userId) throw new ForbiddenException();
    return this.enrichTicketWithAuthorAndMessages(ticket);
  }

  // ── User: add a reply to own ticket ────────────────────────────────────────
  async replyToTicket(ticketId: string, dto: ReplyTicketDto, senderId: string): Promise<TicketMessage> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.authorId !== senderId) throw new ForbiddenException();
    if (ticket.status === TicketStatus.RESOLVED) throw new ForbiddenException('Ticket is resolved');

    const message = this.messageRepo.create({ body: dto.body, senderId, ticketId });
    const saved   = await this.messageRepo.save(message);

    if (ticket.status === TicketStatus.WAITING_FOR_USER) {
      await this.ticketRepo.update(ticketId, { status: TicketStatus.IN_PROGRESS });
    }
    return saved;
  }

  // ── Admin: list all tickets ───────────────────────────────────────────────
  async adminListTickets(page = 1, limit = 20, status?: TicketStatus) {
    const where: any = {};
    if (status) where.status = status;

    const [tickets, total] = await this.ticketRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // enrich with author info (no messages for the list view — faster)
    const authorIds = [...new Set(tickets.map(t => t.authorId).filter(Boolean))];
    const authors = authorIds.length
      ? await this.userRepo
          .createQueryBuilder('u')
          .select(['u.id', 'u.firstName', 'u.lastName', 'u.email', 'u.role', 'u.phone'])
          .where('u.id IN (:...ids)', { ids: authorIds })
          .getMany()
      : [];
    const authorById = new Map(authors.map(u => [u.id, u]));

    const data = tickets.map(t => {
      const author = authorById.get(t.authorId) ?? null;
      return {
        ...t,
        author: author
          ? {
              id:        author.id,
              firstName: (author as any).firstName ?? '',
              lastName:  (author as any).lastName  ?? '',
              email:     (author as any).email     ?? '',
              phone:     (author as any).phone     ?? '',
              role:      (author as any).role      ?? '',
            }
          : null,
      };
    });

    return { data, total, page, limit };
  }

  // ── Admin: get full ticket with messages ──────────────────────────────────
  async adminGetTicket(ticketId: string) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.enrichTicketWithAuthorAndMessages(ticket);
  }

  // ── Admin: reply to a ticket ──────────────────────────────────────────────
  async adminReply(ticketId: string, dto: ReplyTicketDto, adminId: string): Promise<TicketMessage> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === TicketStatus.RESOLVED) throw new ForbiddenException('Ticket is already resolved');

    const message = this.messageRepo.create({ body: dto.body, senderId: adminId, ticketId });
    const saved   = await this.messageRepo.save(message);

    const newStatus =
      ticket.status === TicketStatus.OPEN ? TicketStatus.IN_PROGRESS : TicketStatus.WAITING_FOR_USER;
    await this.ticketRepo.update(ticketId, {
      status: newStatus,
      assignedAdminId: adminId,
    });
    return saved;
  }

  // ── Admin: update status manually ─────────────────────────────────────────
  async adminUpdateStatus(ticketId: string, dto: UpdateTicketStatusDto, adminId: string) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const updates: Partial<SupportTicket> = { status: dto.status, assignedAdminId: adminId };
    if (dto.status === TicketStatus.RESOLVED) updates.resolvedAt = new Date();

    await this.ticketRepo.update(ticketId, updates);
    return this.ticketRepo.findOneOrFail({ where: { id: ticketId } });
  }

  // ── Admin: assign ticket to self ──────────────────────────────────────────
  async adminAssign(ticketId: string, adminId: string) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    await this.ticketRepo.update(ticketId, { assignedAdminId: adminId });
    return this.ticketRepo.findOneOrFail({ where: { id: ticketId } });
  }
}