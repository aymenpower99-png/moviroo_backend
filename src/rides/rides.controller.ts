import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
  ForbiddenException,
  HttpCode,
  Query,
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
import {
  GetVehiclePricesDto,
  GetVehiclePricesResponse,
} from './application/dtos/get-vehicle-prices.dto';
import { CreateRideUseCase } from './application/use-cases/create-ride.use-case';
import { ConfirmRideUseCase } from './application/use-cases/confirm-ride.use-case';
import { CancelRideUseCase } from './application/use-cases/cancel-ride.use-case';
import { GetVehiclePricesUseCase } from './application/use-cases/get-vehicle-prices.use-case';
import { DispatchOffer } from '../dispatch/domain/entities/dispatch-offer.entity';
import { TripPayment } from '../billing/entities/trip-payment.entity';

@Controller('rides')
export class RidesController {
  constructor(
    private readonly createRideUC: CreateRideUseCase,
    private readonly confirmRideUC: ConfirmRideUseCase,
    private readonly cancelRideUC: CancelRideUseCase,
    private readonly getVehiclePricesUC: GetVehiclePricesUseCase,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(DispatchOffer)
    private readonly offerRepo: Repository<DispatchOffer>,
    @InjectRepository(TripPayment)
    private readonly paymentRepo: Repository<TripPayment>,
  ) {}

  /* ─── Get vehicle class prices by coordinates ───────────────────── */
  @Get('pricing')
  @UseGuards(AuthGuard('jwt'))
  async getVehiclePrices(
    @Query() dto: GetVehiclePricesDto,
  ): Promise<GetVehiclePricesResponse> {
    return this.getVehiclePricesUC.execute(dto);
  }

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
  confirm(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
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

    if (user.role !== UserRole.SUPER_ADMIN && ride.passengerId !== user.id) {
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
        relations: ['passenger', 'vehicleClass', 'driver', 'vehicle'],
        order: { createdAt: 'DESC' },
        take: 200,
      });
    }

    // Driver sees rides assigned to them
    if (user.role === UserRole.DRIVER) {
      return this.rideRepo.find({
        where: { driverId: user.id },
        relations: ['passenger', 'vehicleClass', 'vehicle'],
        order: { createdAt: 'DESC' },
      });
    }

    // Passenger sees their own rides
    return this.rideRepo.find({
      where: { passengerId: user.id },
      relations: ['vehicleClass', 'driver', 'vehicle'],
      order: { createdAt: 'DESC' },
    });
  }

  /* ─── Hard delete ride (admin only) ──────── */
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(204)
  async hardDelete(@Param('id', ParseUUIDPipe) id: string) {
    const ride = await this.rideRepo.findOne({ where: { id } });
    if (!ride) throw new NotFoundException('Ride not found');

    // 1. Delete trip_payments (trip_payments → rides)
    await this.paymentRepo.delete({ rideId: id });

    // 2. Delete dispatch offers (dispatch_offers → rides)
    await this.offerRepo.delete({ rideId: id });

    // 4. Finally delete the ride
    await this.rideRepo.delete(id);
  }
}
