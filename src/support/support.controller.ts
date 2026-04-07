import {
  Body, Controller, Get, Param, ParseUUIDPipe,
  Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entites/user.entity';
import { TicketStatus } from './entities/support-ticket.entity';

// helper to pull userId from JWT payload (same pattern used elsewhere in the project)
function userId(req: Request): string {
  return (req.user as any).sub ?? (req.user as any).id;
}

// ─────────────────────────────────────────────────
// USER endpoints  — any authenticated user (driver or passenger)
// ─────────────────────────────────────────────────
@Controller('support/tickets')
@UseGuards(AuthGuard('jwt'))
export class SupportUserController {
  constructor(private readonly svc: SupportService) {}

  @Post()
  create(@Body() dto: CreateTicketDto, @Req() req: Request) {
    return this.svc.createTicket(dto, userId(req));
  }

  @Get()
  listMine(
    @Req() req: Request,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listMyTickets(userId(req), +page, +limit);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.svc.getMyTicket(id, userId(req));
  }

  @Post(':id/reply')
  reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyTicketDto,
    @Req() req: Request,
  ) {
    return this.svc.replyToTicket(id, dto, userId(req));
  }
}

// ─────────────────────────────────────────────────
// ADMIN endpoints  — super_admin only
// ─────────────────────────────────────────────────
@Controller('admin/support/tickets')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SupportAdminController {
  constructor(private readonly svc: SupportService) {}

  @Get()
  listAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: TicketStatus,
  ) {
    return this.svc.adminListTickets(+page, +limit, status);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.adminGetTicket(id);
  }

  @Post(':id/reply')
  reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyTicketDto,
    @Req() req: Request,
  ) {
    return this.svc.adminReply(id, dto, userId(req));
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketStatusDto,
    @Req() req: Request,
  ) {
    return this.svc.adminUpdateStatus(id, dto, userId(req));
  }

  @Post(':id/assign')
  assign(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.svc.adminAssign(id, userId(req));
  }
}
