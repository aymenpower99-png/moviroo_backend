import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkArea } from './entities/work-area.entity';
import { Driver, DriverAvailabilityStatus } from '../driver/entities/driver.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { User } from '../users/entites/user.entity';
import { CreateWorkAreaDto } from './dto/create-work-area.dto';

@Injectable()
export class WorkAreaService {
  constructor(
    @InjectRepository(WorkArea)  private workAreaRepo: Repository<WorkArea>,
    @InjectRepository(Driver)    private driverRepo:   Repository<Driver>,
    @InjectRepository(Vehicle)   private vehicleRepo:  Repository<Vehicle>,
    @InjectRepository(User)      private userRepo:     Repository<User>,
  ) {}

  async create(dto: CreateWorkAreaDto): Promise<WorkArea> {
    const area = this.workAreaRepo.create({ country: dto.country, ville: dto.ville });
    return this.workAreaRepo.save(area);
  }

  async findAll(): Promise<WorkArea[]> {
    return this.workAreaRepo.find({ order: { country: 'ASC', ville: 'ASC' } });
  }

  async remove(id: string): Promise<{ message: string }> {
    const area = await this.workAreaRepo.findOne({ where: { id } });
    if (!area) throw new NotFoundException(`Work area "${id}" not found.`);
    await this.workAreaRepo.delete(id);
    return { message: 'Work area deleted.' };
  }

  async assignToDriver(driverId: string, workAreaId: string | null): Promise<Driver> {
    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException(`Driver "${driverId}" not found.`);

    if (workAreaId) {
      const area = await this.workAreaRepo.findOne({ where: { id: workAreaId } });
      if (!area) throw new NotFoundException(`Work area "${workAreaId}" not found.`);
    }

    driver.workAreaId = workAreaId ?? null;

    const vehicle = await this.vehicleRepo.findOne({ where: { driverId: driver.id } });
    if (
      driver.availabilityStatus === DriverAvailabilityStatus.SETUP_REQUIRED &&
      !!vehicle &&
      !!workAreaId
    ) {
      driver.availabilityStatus = DriverAvailabilityStatus.OFFLINE;
    }

    return this.driverRepo.save(driver);
  }

  async findDriversWithWorkArea() {
    const drivers  = await this.driverRepo.find({ order: { createdAt: 'DESC' } });
    const areas    = await this.workAreaRepo.find();
    const vehicles = await this.vehicleRepo.find();

    // Fetch user names for all drivers
    const userIds = drivers.map(d => d.userId).filter(Boolean);
    const users = userIds.length
      ? await this.userRepo
          .createQueryBuilder('u')
          .select(['u.id', 'u.firstName', 'u.lastName'])
          .where('u.id IN (:...ids)', { ids: userIds })
          .getMany()
      : [];

    const userById    = new Map(users.map(u => [u.id, u]));
    const areaById    = new Map(areas.map(a => [a.id, a]));
    const vehByDriver = new Map(vehicles.map(v => [v.driverId ?? '', v]));

    return drivers.map(d => {
      const area = d.workAreaId ? areaById.get(d.workAreaId) ?? null : null;
      const veh  = vehByDriver.get(d.id) ?? null;
      const user = userById.get(d.userId) ?? null;
      const firstName = (user as any)?.firstName ?? '';
      const lastName  = (user as any)?.lastName  ?? '';
      return {
        id:                 d.id,
        name:               `${firstName} ${lastName}`.trim() || '—',
        vehicle:            veh ? `${veh.make} ${veh.model}` : null,
        availabilityStatus: d.availabilityStatus,
        workAreaId:         d.workAreaId ?? null,
        workArea:           area ? { id: area.id, country: area.country, ville: area.ville } : null,
      };
    });
  }
}