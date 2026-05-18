import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Vehicle, VehicleStatus } from '../vehicles/entities/vehicle.entity';
import { Ride } from '../rides/domain/entities/ride.entity';
import { RideStatus } from '../rides/domain/enums/ride-status.enum';

@Injectable()
export class PublicStatsService {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
  ) {}

  async getPublicStats(): Promise<{
    activeVehicles: number;
    completedTrips: number;
    tripsToday: number;
  }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 1. Active Vehicles = AVAILABLE or ON_TRIP
    const activeVehicles = await this.vehicleRepo.count({
      where: [
        { status: VehicleStatus.AVAILABLE },
        { status: VehicleStatus.ON_TRIP },
      ],
    });

    // 2. Trips Today = rides created today
    const tripsToday = await this.rideRepo.count({
      where: {
        createdAt: Between(todayStart, todayEnd),
      },
    });

    // 3. Completed Trips = rides completed today
    const completedTrips = await this.rideRepo.count({
      where: {
        createdAt: Between(todayStart, todayEnd),
        status: RideStatus.COMPLETED,
      },
    });

    return {
      activeVehicles,
      completedTrips,
      tripsToday,
    };
  }
}
