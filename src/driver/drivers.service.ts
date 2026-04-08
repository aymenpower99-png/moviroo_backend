import { Injectable } from '@nestjs/common';
import { DriverProfileService }      from './services/driver-profile.service';
import { DriverAvailabilityService } from './services/driver-availability.service';
import { DriverAdminService }        from './services/driver-admin.service';
import { Driver, DriverAvailabilityStatus } from './entities/driver.entity';
import { CompleteDriverProfileDto }  from './dto/complete-driver-profile.dto';
import { CreateDriverDto }           from './dto/create-driver.dto';
import { UpdateDriverDto }           from './dto/update-driver.dto';

@Injectable()
export class DriversService {
  constructor(
    private profileService:      DriverProfileService,
    private availabilityService: DriverAvailabilityService,
    private adminService:        DriverAdminService,
  ) {}

  // ── Driver self-service ──────────────────────────────────────────────────────
  completeProfile(userId: string, dto: CompleteDriverProfileDto) {
    return this.profileService.completeProfile(userId, dto);
  }
  getMyProfile(userId: string) {
    return this.profileService.getMyProfile(userId);
  }
  setMyAvailability(
    userId: string,
    status: DriverAvailabilityStatus.ONLINE | DriverAvailabilityStatus.OFFLINE,
  ): Promise<Driver> {
    return this.availabilityService.setMyAvailability(userId, status);
  }

  // ── Internal transitions ─────────────────────────────────────────────────────
  markSetupRequired(userId: string)   { return this.availabilityService.markSetupRequired(userId); }
  markOfflineIfReady(driverId: string){ return this.availabilityService.markOfflineIfReady(driverId); }

  // ── Admin CRUD ───────────────────────────────────────────────────────────────
  create(dto: CreateDriverDto)              { return this.adminService.create(dto); }
  findAll(page?: number, limit?: number, availabilityStatus?: DriverAvailabilityStatus) {
    return this.adminService.findAll(page, limit, availabilityStatus);
  }
  findOne(id: string)                       { return this.adminService.findOne(id); }
  update(id: string, dto: UpdateDriverDto)  { return this.adminService.update(id, dto); }
  remove(id: string)                        { return this.adminService.remove(id); }
}