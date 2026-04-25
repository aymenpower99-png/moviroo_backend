import { Injectable, Logger } from '@nestjs/common';
import { PlaceRepository } from '../repositories/place.repository';
import { Place } from '../entities/place.entity';

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(private readonly placeRepository: PlaceRepository) {}

  async findNearby(
    latitude: number,
    longitude: number,
    radiusKm: number = 5,
    limit: number = 20,
  ): Promise<Place[]> {
    this.logger.log(
      `Finding nearby places: lat=${latitude}, lon=${longitude}, radius=${radiusKm}km, limit=${limit}`,
    );

    const places = await this.placeRepository.findNearby(
      latitude,
      longitude,
      radiusKm,
      limit,
    );

    this.logger.log(`Found ${places.length} nearby places`);
    return places;
  }

  async searchByName(query: string, limit: number = 20): Promise<Place[]> {
    this.logger.log(`Searching places by name: query="${query}", limit=${limit}`);

    if (!query || query.trim().length < 2) {
      return [];
    }

    const places = await this.placeRepository.searchByName(query, limit);

    this.logger.log(`Found ${places.length} places matching "${query}"`);
    return places;
  }

  async savePlace(placeData: Partial<Place>): Promise<Place> {
    this.logger.log(`Saving place: ${placeData.displayName}`);

    // Check if place already exists by external ID
    if (placeData.externalId) {
      const existing = await this.placeRepository.findByExternalId(
        placeData.externalId,
      );
      if (existing) {
        this.logger.log(`Place already exists with external_id: ${placeData.externalId}`);
        return existing;
      }
    }

    const place = await this.placeRepository.create(placeData);
    this.logger.log(`Place saved with id: ${place.id}`);
    return place;
  }

  async getPlaceById(id: string): Promise<Place | null> {
    this.logger.log(`Getting place by id: ${id}`);
    return await this.placeRepository.findById(id);
  }

  async incrementPopularity(id: string): Promise<void> {
    this.logger.log(`Incrementing popularity for place: ${id}`);
    await this.placeRepository.incrementPopularity(id);
  }
}
