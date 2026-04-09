import {
  Body, Controller, Delete, Get,
  HttpCode, Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { AuthGuard }  from '@nestjs/passport';
import { Roles }      from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole }   from '../users/entites/user.entity';
import { WorkAreaService }   from './work-area.service';
import { CreateWorkAreaDto } from './dto/create-work-area.dto';
import { AssignWorkAreaDto } from './dto/assign-work-area.dto';

@Controller('work-areas')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class WorkAreaController {
  constructor(private readonly workAreaService: WorkAreaService) {}

  @Post()
  create(@Body() dto: CreateWorkAreaDto) {
    return this.workAreaService.create(dto);
  }

  @Get()
  findAll() {
    return this.workAreaService.findAll();
  }

  @Get('drivers')
  findDriversWithWorkArea() {
    return this.workAreaService.findDriversWithWorkArea();
  }

  @Post('drivers/:driverId/assign')
  @HttpCode(200)
  assignToDriver(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: AssignWorkAreaDto,
  ) {
    return this.workAreaService.assignToDriver(driverId, dto.workAreaId ?? null);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.workAreaService.remove(id);
  }
}