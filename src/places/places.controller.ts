import { Controller, Get, Query, Param } from '@nestjs/common';
import { PlacesService } from './services/places.service';
import { Place } from './entities/place.entity';

@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get('nearby')
  async findNearby(
    @Query('lat') latitude: number,
    @Query('lon') longitude: number,
    @Query('radius') radiusKm: number = 5,
    @Query('limit') limit: number = 20,
  ): Promise<Place[]> {
    return await this.placesService.findNearby(
      latitude,
      longitude,
      radiusKm,
      limit,
    );
  }

  @Get('search')
  async searchByName(
    @Query('q') query: string,
    @Query('limit') limit: number = 20,
  ): Promise<Place[]> {
    return await this.placesService.searchByName(query, limit);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<Place | null> {
    return await this.placesService.getPlaceById(id);
  }
}
