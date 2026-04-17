import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { EarningsService } from './earnings.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entites/user.entity';

function userId(req: Request): string {
  return (req.user as any).sub ?? (req.user as any).id;
}

// ── Driver endpoints ──
@Controller('earnings')
@UseGuards(AuthGuard('jwt'))
export class EarningsDriverController {
  constructor(private readonly svc: EarningsService) {}

  @Get('me')
  async getMyEarnings(@Req() req: Request, @Query('month') monthStr?: string) {
    const uid = userId(req);
    const { year, month } = this.parseMonth(monthStr);

    // Get driver record from userId
    return this.svc.getDriverEarningsByUserId(uid, year, month);
  }

  @Get('config')
  getConfig() {
    return this.svc.getConfig();
  }

  private parseMonth(monthStr?: string): { year: number; month: number } {
    if (monthStr) {
      const [y, m] = monthStr.split('-').map(Number);
      if (y && m) return { year: y, month: m };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
}

// ── Admin endpoints ──
@Controller('admin/earnings')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class EarningsAdminController {
  constructor(private readonly svc: EarningsService) {}

  @Get('config')
  getConfig() {
    return this.svc.getConfig();
  }

  @Patch('config')
  updateConfig(@Body() dto: any) {
    return this.svc.updateConfig(dto);
  }

  @Get(':driverId')
  getDriverEarnings(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query('month') monthStr?: string,
  ) {
    const { year, month } = this.parseMonth(monthStr);
    return this.svc.adminGetDriverEarnings(driverId, year, month);
  }

  private parseMonth(monthStr?: string): { year: number; month: number } {
    if (monthStr) {
      const [y, m] = monthStr.split('-').map(Number);
      if (y && m) return { year: y, month: m };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
}
