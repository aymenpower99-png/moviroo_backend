import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entites/user.entity';

import { Ride } from './domain/entities/ride.entity';
import { CreateRideDto } from './application/dtos/create-ride.dto';
import { CancelRideDto } from './application/dtos/cancel-ride.dto';
import { CreateRideUseCase } from './application/use-cases/create-ride.use-case';
import { ConfirmRideUseCase } from './application/use-cases/confirm-ride.use-case';
import { CancelRideUseCase } from './application/use-cases/cancel-ride.use-case';

@Controller('rides')
export class RidesController {
  constructor(
    private readonly createRideUC: CreateRideUseCase,
    private readonly confirmRideUC: ConfirmRideUseCase,
    private readonly cancelRideUC: CancelRideUseCase,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
  ) {}

  /* ─── Create a new ride ───────────────────── */
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.PASSENGER, UserRole.SUPER_ADMIN)
  create(@CurrentUser() user: User, @Body() dto: CreateRideDto) {
    return this.createRideUC.execute(user, dto);
  }

  /* ─── Confirm (lock price → SEARCHING_DRIVER) */
  @Patch(':id/confirm')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.PASSENGER, UserRole.SUPER_ADMIN)
  confirm(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.confirmRideUC.execute(user, id);
  }

  /* ─── Cancel a ride ───────────────────────── */
  @Patch(':id/cancel')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.PASSENGER, UserRole.SUPER_ADMIN)
  cancel(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelRideDto,
  ) {
    return this.cancelRideUC.execute(user, id, dto);
  }

  /* ─── Get single ride ────────────────────── */
  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  async findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ride = await this.rideRepo.findOne({
      where: { id },
      relations: ['passenger', 'vehicleClass', 'driver', 'vehicle'],
    });
    if (!ride) throw new NotFoundException('Ride not found');

    if (
      user.role !== UserRole.SUPER_ADMIN &&
      ride.passengerId !== user.id
    ) {
      throw new ForbiddenException('Not your ride');
    }
    return ride;
  }

  /* ─── List rides ──────────────────────────── */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@CurrentUser() user: User) {
    if (user.role === UserRole.SUPER_ADMIN) {
      return this.rideRepo.find({
        relations: ['passenger', 'vehicleClass'],
        order: { createdAt: 'DESC' },
        take: 100,
      });
    }
    return this.rideRepo.find({
      where: { passengerId: user.id },
      relations: ['vehicleClass'],
      order: { createdAt: 'DESC' },
    });
  }
}
