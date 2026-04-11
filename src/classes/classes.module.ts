import { Module }          from '@nestjs/common';
import { TypeOrmModule }   from '@nestjs/typeorm';
import { VehicleClass }    from './entities/class.entity';
import { Vehicle }         from '../vehicles/entities/vehicle.entity';
import { Driver }          from '../driver/entities/driver.entity';
import { User }            from '../users/entites/user.entity';
import { ClassesController } from './classes.controller';
import { ClassesService }    from './classes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VehicleClass, Vehicle, Driver, User]),
  ],
  controllers: [ClassesController],
  providers:   [ClassesService],
  exports:     [ClassesService],
})
export class ClassesModule {}