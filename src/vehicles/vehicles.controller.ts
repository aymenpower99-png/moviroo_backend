import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entites/user.entity';
import { VehicleStatus } from './entities/vehicle.entity';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  // ─── Makes: full list ─────────────────────────────────────────────────────
  // IMPORTANT: static routes MUST come before :param routes

  @Get('makes')
  @UseGuards(AuthGuard('jwt'))
  getAllMakes() {
    return this.vehiclesService.getAllMakes();
  }

  // ─── Makes: search ?q=toyo ────────────────────────────────────────────────

  @Get('makes/search')
  @UseGuards(AuthGuard('jwt'))
  searchMakes(@Query('q') q: string) {
    if (!q || q.trim().length < 1) return this.vehiclesService.getAllMakes();
    return this.vehiclesService.searchMakes(q.trim());
  }

  // ─── Makes: models for a given make ID ───────────────────────────────────

  @Get('makes/:makeId/models')
  @UseGuards(AuthGuard('jwt'))
  getModelsByMake(@Param('makeId', ParseIntPipe) makeId: number) {
    return this.vehiclesService.getModelsByMakeId(makeId);
  }

  // ─── CREATE ───────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  create(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(dto);
  }

  // ─── LIST ALL ─────────────────────────────────────────────────────────────

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  findAll(
    @Query('page')     page?:     string,
    @Query('limit')    limit?:    string,
    @Query('agencyId') agencyId?: string,
    @Query('driverId') driverId?: string,
    @Query('status')   status?:   VehicleStatus,
  ) {
    return this.vehiclesService.findAll(
      page  ? +page  : 1,
      limit ? +limit : 20,
      agencyId,
      driverId,
      status,
    );
  }

  // ─── GET ONE ──────────────────────────────────────────────────────────────

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.findOne(id);
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(id, dto);
  }

  // ─── VERIFY (Admin only) ──────────────────────────────────────────────────

  @Post(':id/verify')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(200)
  verify(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.verify(id);
  }

  // ─── SOFT DELETE ──────────────────────────────────────────────────────────

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGENCY)
  @HttpCode(200)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.remove(id);
  }

  // ─── HARD DELETE (Admin only) ─────────────────────────────────────────────

  @Delete(':id/hard')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(200)
  hardDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.hardDelete(id);
  }
}