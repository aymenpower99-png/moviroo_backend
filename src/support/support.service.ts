import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket, TicketStatus } from './entities/support-ticket.entity';
import { TicketMessage } from './entities/ticket-message.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { User, UserRole } from '../users/entites/user.entity';
import { SupportGateway } from './support.gateway';
import { FcmService } from '../notifications/services/fcm.service';

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket)
    private ticketRepo: Repository<SupportTicket>,
    @InjectRepository(TicketMessage)
    private messageRepo: Repository<TicketMessage>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private gateway: SupportGateway,
    private readonly fcmService: FcmService,
  ) {}

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Notify all admin users via FCM (best-effort). */
  private async _notifyAdmins(
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const admins = await this.userRepo.find({
      where: { role: UserRole.SUPER_ADMIN },
      select: ['id'],
    });
    for (const admin of admins) {
      this.fcmService.sendToUser(admin.id, title, body, data).catch(() => {});
    }
  }

  private async enrichTicketWithAuthorAndMessages(ticket: SupportTicket) {
    // fetch messages for this ticket
    const messages = await this.messageRepo.find({
      where: { ticketId: ticket.id },
      order: { createdAt: 'ASC' },
    });

    // collect all unique user IDs (author + senders)
    const userIds = [
      ticket.authorId,
      ...messages.map((m) => m.senderId),
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    const users = userIds.length
      ? await this.userRepo
          .createQueryBuilder('u')
          .select([
            'u.id',
            'u.firstName',
            'u.lastName',
            'u.email',
            'u.role',
            'u.phone',
          ])
          .where('u.id IN (:...ids)', { ids: userIds })
          .getMany()
      : [];

    const userById = new Map(users.map((u) => [u.id, u]));
    const author = userById.get(ticket.authorId) ?? null;

    return {
      ...ticket,
      author: author
        ? {
            id: author.id,
            firstName: (author as any).firstName ?? '',
            lastName: (author as any).lastName ?? '',
            email: (author as any).email ?? '',
            phone: (author as any).phone ?? '',
            role: (author as any).role ?? '',
          }
        : null,
      messages: messages.map((m) => {
        const sender = userById.get(m.senderId) ?? null;
        return {
          ...m,
          sender: sender
            ? {
                id: sender.id,
                firstName: (sender as any).firstName ?? '',
                lastName: (sender as any).lastName ?? '',
                email: (sender as any).email ?? '',
                role: (sender as any).role ?? '',
              }
            : null,
        };
      }),
    };
  }

  // ── User: create a ticket ──────────────────────────────────────────────────
  async createTicket(
    dto: CreateTicketDto,
    authorId: string,
  ): Promise<SupportTicket> {
    const ticket = this.ticketRepo.create({
      ...dto,
      authorId,
      status: TicketStatus.OPEN,
    });
    const saved = await this.ticketRepo.save(ticket);

    // Notify admins that a new ticket was opened
    this._notifyAdmins('New Support Ticket', dto.subject, {
      type: 'SUPPORT_TICKET_CREATED',
      ticketId: saved.id,
      subject: dto.subject,
      channelId: 'support_messages',
    }).catch(() => {});

    // Real-time WebSocket broadcast to all admins
    this.gateway.emitToAdmins('support:ticket:created', {
      ticket: await this.enrichTicketWithAuthorAndMessages(saved),
    });

    return saved;
  }

  // ── User: list own tickets ─────────────────────────────────────────────────
  async listMyTickets(authorId: string, page = 1, limit = 20) {
    const [tickets, total] = await this.ticketRepo.findAndCount({
      where: { authorId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Enrich each ticket with lastMessage and lastMessageAt
    const data = await Promise.all(
      tickets.map(async (t) => {
        const lastMsg = await this.messageRepo.findOne({
          where: { ticketId: t.id },
          order: { createdAt: 'DESC' },
        });
        return {
          ...t,
          lastMessage: lastMsg?.body ?? null,
          lastMessageAt: lastMsg?.createdAt ?? null,
        };
      }),
    );

    return { data, total, page, limit };
  }

  // ── User: get one ticket (must be owner) ──────────────────────────────────
  async getMyTicket(ticketId: string, userId: string) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.authorId !== userId) throw new ForbiddenException();
    const enriched = await this.enrichTicketWithAuthorAndMessages(ticket);
    console.log(
      `[SupportService] getMyTicket - ticketId: ${ticketId}, messages count: ${enriched.messages?.length || 0}`,
    );
    return enriched;
  }

  // ── User: add a reply to own ticket ────────────────────────────────────────
  async replyToTicket(
    ticketId: string,
    dto: ReplyTicketDto,
    senderId: string,
  ): Promise<TicketMessage> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.authorId !== senderId) throw new ForbiddenException();
    if (ticket.status === TicketStatus.RESOLVED)
      throw new ForbiddenException('Ticket is resolved');

    const message = this.messageRepo.create({
      body: dto.body,
      senderId,
      ticketId,
    });
    const saved = await this.messageRepo.save(message);

    if (ticket.status === TicketStatus.WAITING_FOR_USER) {
      await this.ticketRepo.update(ticketId, {
        status: TicketStatus.IN_PROGRESS,
      });
    }

    // Emit to admins that user replied
    this.gateway.emitToAdmins('support:ticket:reply', {
      ticketId,
      message: saved,
      senderId,
    });

    // Push notify the assigned admin (or all admins if unassigned)
    const notifyTitle = 'Ticket Reply';
    const notifyBody =
      dto.body.length > 100 ? dto.body.substring(0, 100) + '…' : dto.body;
    const notifyData: Record<string, string> = {
      type: 'SUPPORT_TICKET_REPLY',
      ticketId,
      senderId,
      channelId: 'support_messages',
    };
    if (ticket.assignedAdminId) {
      this.fcmService
        .sendToUser(ticket.assignedAdminId, notifyTitle, notifyBody, notifyData)
        .catch(() => {});
    } else {
      this._notifyAdmins(notifyTitle, notifyBody, notifyData).catch(() => {});
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
    const authorIds = [
      ...new Set(tickets.map((t) => t.authorId).filter(Boolean)),
    ];
    const authors = authorIds.length
      ? await this.userRepo
          .createQueryBuilder('u')
          .select([
            'u.id',
            'u.firstName',
            'u.lastName',
            'u.email',
            'u.role',
            'u.phone',
          ])
          .where('u.id IN (:...ids)', { ids: authorIds })
          .getMany()
      : [];
    const authorById = new Map(authors.map((u) => [u.id, u]));

    const data = tickets.map((t) => {
      const author = authorById.get(t.authorId) ?? null;
      return {
        ...t,
        author: author
          ? {
              id: author.id,
              firstName: (author as any).firstName ?? '',
              lastName: (author as any).lastName ?? '',
              email: (author as any).email ?? '',
              phone: (author as any).phone ?? '',
              role: (author as any).role ?? '',
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
  async adminReply(
    ticketId: string,
    dto: ReplyTicketDto,
    adminId: string,
  ): Promise<TicketMessage> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === TicketStatus.RESOLVED)
      throw new ForbiddenException('Ticket is already resolved');

    const message = this.messageRepo.create({
      body: dto.body,
      senderId: adminId,
      ticketId,
    });
    const saved = await this.messageRepo.save(message);

    const newStatus =
      ticket.status === TicketStatus.OPEN
        ? TicketStatus.IN_PROGRESS
        : TicketStatus.WAITING_FOR_USER;
    await this.ticketRepo.update(ticketId, {
      status: newStatus,
      assignedAdminId: adminId,
    });

    // Emit to user that admin replied
    this.gateway.emitToUser(ticket.authorId, 'support:ticket:reply', {
      ticketId,
      message: saved,
      senderId: adminId,
      status: newStatus,
    });

    // Push notify the ticket author
    const notifyBody =
      dto.body.length > 100 ? dto.body.substring(0, 100) + '…' : dto.body;
    this.fcmService
      .sendToUser(ticket.authorId, 'Support Reply', notifyBody, {
        type: 'SUPPORT_TICKET_REPLY',
        ticketId,
        senderId: adminId,
        status: newStatus,
        channelId: 'support_messages',
      })
      .catch(() => {});

    return saved;
  }

  // ── Admin: update status manually ─────────────────────────────────────────
  async adminUpdateStatus(
    ticketId: string,
    dto: UpdateTicketStatusDto,
    adminId: string,
  ) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const updates: Partial<SupportTicket> = {
      status: dto.status,
      assignedAdminId: adminId,
    };
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

  // ── Admin: hard delete ticket ─────────────────────────────────────────────
  async adminDeleteTicket(ticketId: string): Promise<{ message: string }> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    await this.messageRepo.delete({ ticketId });
    await this.ticketRepo.delete(ticketId);
    return { message: `Ticket "${ticketId}" permanently deleted.` };
  }

  // ── User: edit own message ────────────────────────────────────────────────
  async updateMyMessage(
    ticketId: string,
    messageId: string,
    dto: UpdateMessageDto,
    userId: string,
  ) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === TicketStatus.RESOLVED)
      throw new ForbiddenException('Ticket is resolved');
    if (ticket.authorId !== userId) throw new ForbiddenException();

    const message = await this.messageRepo.findOne({
      where: { id: messageId, ticketId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId)
      throw new ForbiddenException('You can only edit your own messages');

    message.body = dto.body;
    message.updatedAt = new Date();
    const saved = await this.messageRepo.save(message);

    this.gateway.emitToAdmins('support:message:updated', {
      ticketId,
      message: saved,
      senderId: userId,
    });

    return saved;
  }

  // ── User: delete own message ──────────────────────────────────────────────
  async deleteMyMessage(ticketId: string, messageId: string, userId: string) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === TicketStatus.RESOLVED)
      throw new ForbiddenException('Ticket is resolved');
    if (ticket.authorId !== userId) throw new ForbiddenException();

    const message = await this.messageRepo.findOne({
      where: { id: messageId, ticketId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId)
      throw new ForbiddenException('You can only delete your own messages');

    await this.messageRepo.delete(messageId);

    this.gateway.emitToAdmins('support:message:deleted', {
      ticketId,
      messageId,
      senderId: userId,
    });

    return { success: true, messageId };
  }

  // ── Admin: edit own message ───────────────────────────────────────────────
  async adminUpdateMessage(
    ticketId: string,
    messageId: string,
    dto: UpdateMessageDto,
    adminId: string,
  ) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === TicketStatus.RESOLVED)
      throw new ForbiddenException('Ticket is resolved');

    const message = await this.messageRepo.findOne({
      where: { id: messageId, ticketId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== adminId)
      throw new ForbiddenException('You can only edit your own messages');

    message.body = dto.body;
    message.updatedAt = new Date();
    const saved = await this.messageRepo.save(message);

    this.gateway.emitToUser(ticket.authorId, 'support:message:updated', {
      ticketId,
      message: saved,
      senderId: adminId,
    });

    return saved;
  }

  // ── Admin: delete own message ─────────────────────────────────────────────
  async adminDeleteMessage(
    ticketId: string,
    messageId: string,
    adminId: string,
  ) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === TicketStatus.RESOLVED)
      throw new ForbiddenException('Ticket is resolved');

    const message = await this.messageRepo.findOne({
      where: { id: messageId, ticketId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== adminId)
      throw new ForbiddenException('You can only delete your own messages');

    await this.messageRepo.delete(messageId);

    this.gateway.emitToUser(ticket.authorId, 'support:message:deleted', {
      ticketId,
      messageId,
      senderId: adminId,
    });

    return { success: true, messageId };
  }
}
