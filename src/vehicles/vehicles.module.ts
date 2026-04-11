import { Module }        from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehicle }       from './entities/vehicle.entity';
import { Driver }        from '../driver/entities/driver.entity';
import { ClassesModule } from '../classes/classes.module';

import { VehiclesController }   from './vehicles.controller';
import { VehiclesService }      from './vehicles.service';
import { VehicleCrudService }   from './services/vehicle-crud.service';
import { VehicleStatusService } from './services/vehicle-status.service';
import { VehicleMakesService }  from './services/vehicle-makes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle, Driver]),
    ClassesModule,
  ],
  controllers: [VehiclesController],
  providers: [
    VehiclesService,       // facade — depends on the 3 below
    VehicleCrudService,    // ← must be listed here
    VehicleStatusService,  // ← must be listed here
    VehicleMakesService,   // ← must be listed here
  ],
  exports: [VehiclesService, VehicleCrudService],
})
export class VehiclesModule {}