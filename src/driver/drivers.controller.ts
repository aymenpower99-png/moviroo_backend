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
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { SetAvailabilityDto } from './dto/set-availability.dto';
import { CompleteDriverProfileDto } from './dto/complete-driver-profile.dto';
import { UpdateNotificationPrefsDto } from './dto/update-notification-prefs.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entites/user.entity';
import { DriverAvailabilityStatus } from './entities/driver.entity';
import { CloudinaryService } from '../common/services/cloudinary.service';

@Controller('drivers')
@UseGuards(AuthGuard('jwt'))
export class DriversController {
  private readonly logger = new Logger(DriversController.name);
  constructor(
    private readonly driversService: DriversService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // ─── Driver: Get Notification Preferences ────────────────────────────────────

  @Get('me/notifications')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  getNotificationPrefs(@Req() req: Request) {
    const userId = (req.user as any).id as string;
    return this.driversService.getNotificationPrefs(userId);
  }

  // ─── Driver: Update Notification Preferences ─────────────────────────────────

  @Patch('me/notifications')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  @HttpCode(200)
  updateNotificationPrefs(
    @Req() req: Request,
    @Body() body: UpdateNotificationPrefsDto,
  ) {
    const userId = (req.user as any).id as string;
    return this.driversService.updateNotificationPrefs(userId, body);
  }

  // ─── Driver: Complete Own Profile ────────────────────────────────────────────

  @Post('me/complete-profile')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  completeProfile(@Req() req: Request, @Body() dto: CompleteDriverProfileDto) {
    const userId = (req.user as any).id as string;
    return this.driversService.completeProfile(userId, dto);
  }

  // ─── Driver: Get Own Profile ──────────────────────────────────────────────────

  @Get('me')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  getMyProfile(@Req() req: Request) {
    const userId = (req.user as any).id as string;
    return this.driversService.getMyProfile(userId);
  }

  // ─── Driver: Cloudinary Signature for Direct Upload ───────────────────────────

  @Post('me/logo/signature')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  @HttpCode(200)
  getLogoUploadSignature(@Req() req: Request) {
    const userId = (req.user as any).id as string;
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `Photo_profile/drivers/${userId}`;
    const public_id = `logo_${timestamp}`;
    const params = {
      folder,
      public_id,
      overwrite: true,
      invalidate: true,
      timestamp,
    } as const;
    this.logger.log(
      `Signature request: userId=${userId} folder=${folder} public_id=${public_id} ts=${timestamp}`,
    );
    const signature = this.cloudinary.signUpload(params as any);
    const resp = {
      cloudName: this.cloudinary.getCloudName(),
      apiKey: this.cloudinary.getApiKey(),
      timestamp,
      signature,
      folder,
      publicId: public_id,
    };
    this.logger.log(
      `Signature response: cloud=${resp.cloudName} apiKey=${resp.apiKey ? 'set' : '(missing)'} ts=${resp.timestamp} folder=${resp.folder} publicId=${resp.publicId}`,
    );
    return resp;
  }

  // ─── Driver: Persist Uploaded Logo URL ────────────────────────────────────────

  @Patch('me/logo')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  @HttpCode(200)
  async saveLogo(
    @Req() req: Request,
    @Body() body: { url: string; publicId: string },
  ) {
    const userId = (req.user as any).id as string;
    return this.driversService.saveDriverLogo(userId, body);
  }

  // ─── Driver: Delete Logo (revert to initials avatar client-side) ──────────────

  @Delete('me/logo')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  @HttpCode(200)
  async deleteLogo(@Req() req: Request) {
    const userId = (req.user as any).id as string;
    return this.driversService.deleteDriverLogo(userId);
  }

  // ─── Driver: Set Own Availability (online / offline only) ────────────────────────

  @Patch('me/availability')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  @HttpCode(200)
  setMyAvailability(@Req() req: Request, @Body() dto: SetAvailabilityDto) {
    const userId = (req.user as any).id as string;
    // Cast is safe: DriverToggleStatus values are a subset of DriverAvailabilityStatus
    return this.driversService.setMyAvailability(
      userId,
      dto.status as unknown as
        | DriverAvailabilityStatus.ONLINE
        | DriverAvailabilityStatus.OFFLINE,
    );
  }

  // ─── Driver: Seed monthly online time (one-time legacy migration) ─────────────

  @Post('me/seed-monthly-time')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  @HttpCode(200)
  seedMonthlyTime(
    @Req() req: Request,
    @Body() body: { monthlyOnlineMs: number; month: string },
  ) {
    const userId = (req.user as any).id as string;
    return this.driversService.seedMonthlyOnlineTime(
      userId,
      body.monthlyOnlineMs,
      body.month,
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
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('availabilityStatus') availabilityStatus?: DriverAvailabilityStatus,
  ) {
    return this.driversService.findAll(
      page ? +page : 1,
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
