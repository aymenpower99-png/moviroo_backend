import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { SetAvailabilityDto } from './dto/set-availability.dto';
import { CompleteDriverProfileDto } from './dto/complete-driver-profile.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entites/user.entity';
import { DriverAvailabilityStatus } from './entities/driver.entity';

@Controller('drivers')
@UseGuards(AuthGuard('jwt'))
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  // ─── Driver: Get Notification Preferences ────────────────────────────────────

  @Get('me/notifications')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  getNotificationPrefs(@Req() req: Request) {
    const userId = (req.user as any).sub as string;
    return this.driversService.getNotificationPrefs(userId);
  }

  // ─── Driver: Update Notification Preferences ─────────────────────────────────

  @Patch('me/notifications')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  @HttpCode(200)
  updateNotificationPrefs(
    @Req() req: Request,
    @Body() body: { pushEnabled?: boolean; emailEnabled?: boolean },
  ) {
    const userId = (req.user as any).sub as string;
    return this.driversService.updateNotificationPrefs(userId, body);
  }

  // ─── Driver: Complete Own Profile ────────────────────────────────────────────

  @Post('me/complete-profile')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  completeProfile(@Req() req: Request, @Body() dto: CompleteDriverProfileDto) {
    const userId = (req.user as any).sub as string;
    return this.driversService.completeProfile(userId, dto);
  }

  // ─── Driver: Get Own Profile ──────────────────────────────────────────────────

  @Get('me')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  getMyProfile(@Req() req: Request) {
    const userId = (req.user as any).sub as string;
    return this.driversService.getMyProfile(userId);
  }

  // ─── Driver: Set Own Availability (online / offline only) ────────────────────────

  @Patch('me/availability')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  @HttpCode(200)
  setMyAvailability(@Req() req: Request, @Body() dto: SetAvailabilityDto) {
    const userId = (req.user as any).sub as string;
    // Cast is safe: DriverToggleStatus values are a subset of DriverAvailabilityStatus
    return this.driversService.setMyAvailability(
      userId,
      dto.status as unknown as
        | DriverAvailabilityStatus.ONLINE
        | DriverAvailabilityStatus.OFFLINE,
    );
  }

  // ─── Admin / Agency: Create Driver ───────────────────────────────────────────

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  create(@Body() dto: CreateDriverDto) {
    return this.driversService.create(dto);
  }

  // ─── Admin / Agency: List All Drivers ────────────────────────────────────────

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  findAll(
    @Query('page')               page?:               string,
    @Query('limit')              limit?:              string,
    @Query('availabilityStatus') availabilityStatus?: DriverAvailabilityStatus,
  ) {
    return this.driversService.findAll(
      page  ? +page  : 1,
      limit ? +limit : 20,
      availabilityStatus,
    );
  }

  // ─── Admin / Agency: Get One Driver ──────────────────────────────────────────

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.driversService.findOne(id);
  }

  // ─── Admin / Agency: Update Driver ───────────────────────────────────────────

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDriverDto) {
    return this.driversService.update(id, dto);
  }

  // ─── Admin: Delete Driver ─────────────────────────────────────────────────────

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(200)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.driversService.remove(id);
  }
}