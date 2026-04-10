import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehiclesService } from './vehicles.service';
import { VehiclesController } from './vehicles.controller';
import { Vehicle } from './entities/vehicle.entity';
import { Driver } from '../driver/entities/driver.entity';
import { ClassesModule } from '../classes/classes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle, Driver]),
    ClassesModule,
  ],
  controllers: [VehiclesController],
  providers:   [VehiclesService],
  exports:     [VehiclesService],
})
export class VehiclesModule {}