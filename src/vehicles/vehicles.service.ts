import { Injectable } from '@nestjs/common';
import { VehicleCrudService }   from './services/vehicle-crud.service';
import { VehicleStatusService } from './services/vehicle-status.service';
import { VehicleMakesService }  from './services/vehicle-makes.service';
import { CreateVehicleDto }     from './dto/create-vehicle.dto';
import { UpdateVehicleDto }     from './dto/update-vehicle.dto';
import { VehicleStatus }        from './entities/vehicle.entity';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly crudService:   VehicleCrudService,
    private readonly statusService: VehicleStatusService,
    private readonly makesService:  VehicleMakesService,
  ) {}

  // ── Makes & Models ──────────────────────────────────────────────────────────
  getAllMakes()                           { return this.makesService.getAllMakes(); }
  searchMakes(q: string)                 { return this.makesService.searchMakes(q); }
  getModelsByMakeId(makeId: number)      { return this.makesService.getModelsByMakeId(makeId); }

  // ── CRUD ────────────────────────────────────────────────────────────────────
  create(dto: CreateVehicleDto)          { return this.crudService.create(dto); }
  findAll(
    page?: number, limit?: number,
    classId?: string, agencyId?: string,
    driverId?: string, status?: VehicleStatus,
  )                                      { return this.crudService.findAll(page, limit, classId, agencyId, driverId, status); }
  findOne(id: string)                    { return this.crudService.findOne(id); }
  findByClass(classId: string)           { return this.crudService.findByClass(classId); }
  findAvailableInClass(classId: string)  { return this.crudService.findAvailableInClass(classId); }
  update(id: string, dto: UpdateVehicleDto) { return this.crudService.update(id, dto); }
  remove(id: string)                     { return this.crudService.remove(id); }
  hardDelete(id: string)                 { return this.crudService.hardDelete(id); }
  removeFromClass(id: string)            { return this.crudService.removeFromClass(id); }

  // ── Status / Driver ─────────────────────────────────────────────────────────
  assignDriver(id: string, driverId: string) { return this.statusService.assignDriver(id, driverId); }
  setOnTrip(id: string)                  { return this.statusService.setOnTrip(id); }
  endTrip(id: string)                    { return this.statusService.endTrip(id); }
  setMaintenance(id: string)             { return this.statusService.setMaintenance(id); }
  completeMaintenance(id: string)        { return this.statusService.completeMaintenance(id); }
  activate(id: string)                   { return this.statusService.activate(id); }
}