import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MembershipLevelsService } from './membership-levels.service';
import { CreateMembershipLevelDto } from './dto/create-membership-level.dto';
import { UpdateMembershipLevelDto } from './dto/update-membership-level.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entites/user.entity';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/membership-levels')
export class MembershipLevelsController {
  constructor(private readonly service: MembershipLevelsService) {}

  // ── POST /admin/membership-levels ─────────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateMembershipLevelDto) {
    return this.service.create(dto);
  }

  // ── GET /admin/membership-levels ──────────────────────────────────────────
  @Get()
  findAll() {
    return this.service.findAll();
  }

  // ── GET /admin/membership-levels/active ───────────────────────────────────
  // Must be before :id to avoid route conflict
  @Get('active')
  findAllActive() {
    return this.service.findAllActive();
  }

  // ── GET /admin/membership-levels/:id ─────────────────────────────────────
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  // ── PATCH /admin/membership-levels/:id ───────────────────────────────────
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMembershipLevelDto,
  ) {
    return this.service.update(id, dto);
  }

  // ── PATCH /admin/membership-levels/:id/toggle ─────────────────────────────
  // Activate / deactivate — no hard delete
  @Patch(':id/toggle')
  @HttpCode(HttpStatus.OK)
  toggleActive(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.toggleActive(id);
  }
}
