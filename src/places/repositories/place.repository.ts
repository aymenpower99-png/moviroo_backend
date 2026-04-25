import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../entities/place.entity';

@Injectable()
export class PlaceRepository {
  constructor(
    @InjectRepository(Place)
    private readonly repository: Repository<Place>,
  ) {}

  async create(placeData: Partial<Place>): Promise<Place> {
    const place = this.repository.create(placeData);
    return await this.repository.save(place);
  }

  async findById(id: string): Promise<Place | null> {
    return await this.repository.findOne({ where: { id } });
  }

  async findByExternalId(externalId: string): Promise<Place | null> {
    return await this.repository.findOne({ where: { externalId } });
  }

  async findNearby(
    latitude: number,
    longitude: number,
    radiusKm: number = 5,
    limit: number = 20,
  ): Promise<Place[]> {
    // PostGIS ST_DWithin for distance query
    // Returns places within radiusKm kilometers
    return await this.repository
      .createQueryBuilder('place')
      .where(
        `ST_DWithin(place.location, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :radius)`,
        { lat: latitude, lon: longitude, radius: radiusKm * 1000 }, // Convert km to meters
      )
      .andWhere('place.is_active = true')
      .orderBy('place.popularity_score', 'DESC')
      .limit(limit)
      .getMany();
  }

  async searchByName(query: string, limit: number = 20): Promise<Place[]> {
    return await this.repository
      .createQueryBuilder('place')
      .where('place.display_name ILIKE :query', { query: `%${query}%` })
      .andWhere('place.is_active = true')
      .orderBy('place.popularity_score', 'DESC')
      .limit(limit)
      .getMany();
  }

  async update(id: string, updateData: Partial<Place>): Promise<Place | null> {
    await this.repository.update(id, updateData);
    return await this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async incrementPopularity(id: string): Promise<void> {
    await this.repository.increment({ id }, 'popularity_score', 1);
  }
}
