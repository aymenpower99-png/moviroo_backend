import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleClass } from './entities/class.entity';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports:     [TypeOrmModule.forFeature([VehicleClass])],
  controllers: [ClassesController],
  providers:   [ClassesService],
  exports:     [ClassesService],   // exported so VehiclesModule can use it
})
export class ClassesModule {}