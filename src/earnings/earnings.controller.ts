import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { EarningsService } from './earnings.service';

function userId(req: Request): string {
  return (req.user as any).sub ?? (req.user as any).id;
}

@Controller('earnings')
@UseGuards(AuthGuard('jwt'))
export class EarningsDriverController {
  constructor(private readonly svc: EarningsService) {}

  @Get('me')
  async getMyEarnings(@Req() req: Request, @Query('month') monthStr?: string) {
    const uid = userId(req);
    return this.svc.getDriverEarnings(uid, monthStr);
  }
}
