import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Place } from './entities/place.entity';
import { PlaceRepository } from './repositories/place.repository';
import { PlacesService } from './services/places.service';
import { PlacesController } from './places.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Place])],
  controllers: [PlacesController],
  providers: [PlaceRepository, PlacesService],
  exports: [PlaceRepository, PlacesService],
})
export class PlacesModule {}
