import {
  Body, Controller, Delete, Get, HttpCode,
  Param, ParseIntPipe, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { AuthGuard } from '@nestjs/passport';
import { VehiclesService }  from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { Roles }            from '../common/decorators/roles.decorator';
import { RolesGuard }       from '../common/guards/roles.guard';
import { UserRole }         from '../users/entites/user.entity';
import { VehicleStatus }    from './entities/vehicle.entity';

class AssignDriverDto {
  @IsUUID()
  driverId!: string;
}

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  // ── Makes (static routes BEFORE :param routes) ──────────────────────────────

  @Get('makes')
  @UseGuards(AuthGuard('jwt'))
  getAllMakes() {
    return this.vehiclesService.getAllMakes();
  }

  @Get('makes/search')
  @UseGuards(AuthGuard('jwt'))
  searchMakes(@Query('q') q: string) {
    if (!q || q.trim().length < 1) return this.vehiclesService.getAllMakes();
    return this.vehiclesService.searchMakes(q.trim());
  }

  @Get('makes/:makeId/models')
  @UseGuards(AuthGuard('jwt'))
  getModelsByMake(@Param('makeId', ParseIntPipe) makeId: number) {
    return this.vehiclesService.getModelsByMakeId(makeId);
  }

  // ── Dispatch ─────────────────────────────────────────────────────────────────

  @Get('dispatch/:classId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  getAvailableInClass(@Param('classId', ParseUUIDPipe) classId: string) {
    return this.vehiclesService.findAvailableInClass(classId);
  }

  // ── All vehicles in a class ───────────────────────────────────────────────────

  @Get('by-class/:classId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  findByClass(@Param('classId', ParseUUIDPipe) classId: string) {
    return this.vehiclesService.findByClass(classId);
  }

  // ── CREATE ────────────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  create(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(dto);
  }

  // ── LIST ──────────────────────────────────────────────────────────────────────

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  findAll(
    @Query('page')     page?:     string,
    @Query('limit')    limit?:    string,
    @Query('classId')  classId?:  string,
    @Query('agencyId') agencyId?: string,
    @Query('driverId') driverId?: string,
    @Query('status')   status?:   VehicleStatus,
  ) {
    return this.vehiclesService.findAll(
      page  ? +page  : 1,
      limit ? +limit : 20,
      classId, agencyId, driverId, status,
    );
  }

  // ── GET ONE ───────────────────────────────────────────────────────────────────

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.findOne(id);
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────────

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(id, dto);
  }

  // ── ASSIGN DRIVER ─────────────────────────────────────────────────────────────

  @Patch(':id/assign-driver')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(200)
  assignDriver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignDriverDto,
  ) {
    return this.vehiclesService.assignDriver(id, body.driverId);
  }

  // ── TRIP LIFECYCLE ────────────────────────────────────────────────────────────

  @Post(':id/trip')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  @HttpCode(200)
  setOnTrip(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.setOnTrip(id);
  }

  @Post(':id/end-trip')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  @HttpCode(200)
  endTrip(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.endTrip(id);
  }

  // ── MAINTENANCE ───────────────────────────────────────────────────────────────

  @Post(':id/maintenance')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(200)
  setMaintenance(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.setMaintenance(id);
  }

  @Post(':id/maintenance/complete')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(200)
  completeMaintenance(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.completeMaintenance(id);
  }

  // ── REMOVE FROM CLASS ─────────────────────────────────────────────────────────
  // Sets vehicle status → Pending, clears driver. Blocks if On Trip.

  @Delete(':id/from-class')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  @HttpCode(200)
  removeFromClass(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.removeFromClass(id);
  }

  // ── DELETE ────────────────────────────────────────────────────────────────────

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  @HttpCode(200)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.remove(id);
  }

  @Delete(':id/hard')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(200)
  hardDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.hardDelete(id);
  }
}