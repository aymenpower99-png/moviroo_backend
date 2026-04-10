import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehicle } from './entities/vehicle.entity';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { ClassesModule } from '../classes/classes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle]),
    ClassesModule,
  ],
  controllers: [VehiclesController],
  providers:   [VehiclesService],
  exports:     [VehiclesService],
})
export class VehiclesModule {}