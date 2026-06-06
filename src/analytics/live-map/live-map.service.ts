import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DriverLocation } from '../../dispatch/domain/entities/driver-location.entity';
import {
  Driver,
  DriverAvailabilityStatus,
} from '../../driver/entities/driver.entity';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../rides/domain/enums/ride-status.enum';
import { GetDriversDto } from './dto/get-drivers.dto';
import { GetRidesDto } from './dto/get-rides.dto';

@Injectable()
export class LiveMapService {
  constructor(
    @InjectRepository(DriverLocation)
    private readonly driverLocationRepo: Repository<DriverLocation>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
  ) {}

  /**
   * Get online drivers with their current locations
   * Optimized for map display with field selection
   */
  async getOnlineDrivers(dto: GetDriversDto) {
    let query = `
      SELECT 
        dl.driver_id,
        dl.latitude,
        dl.longitude,
        dl.heading,
        dl.speed_kmh,
        dl.is_online,
        dl.last_seen_at,
        dl.progress,
        d.rating_average,
        d.total_trips,
        u.first_name,
        u.last_name
      FROM driver_locations dl
      LEFT JOIN drivers d ON d.user_id = dl.driver_id
      LEFT JOIN users u ON u.id = dl.driver_id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Filter by online status (only if explicitly requested)
    if (dto.online_only === true) {
      query += ` AND dl.is_online = true`;
    }

    // Filter by driver availability status
    if (dto.status) {
      query += ` AND d.availability_status = $${paramIndex}`;
      params.push(dto.status);
      paramIndex++;
    }

    // Filter by minimum rating
    if (dto.rating_min !== undefined) {
      query += ` AND d.rating_average >= $${paramIndex}`;
      params.push(dto.rating_min);
      paramIndex++;
    }

    // Filter by bounding box (map viewport)
    if (
      dto.lat_min !== undefined &&
      dto.lat_max !== undefined &&
      dto.lng_min !== undefined &&
      dto.lng_max !== undefined
    ) {
      query += ` AND dl.latitude BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dto.lat_min, dto.lat_max);
      paramIndex += 2;
      query += ` AND dl.longitude BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dto.lng_min, dto.lng_max);
      paramIndex += 2;
    }

    query += ` ORDER BY dl.last_seen_at DESC`;

    const results = await this.driverLocationRepo.query(query, params);

    return results.map((row: any) => ({
      driver_id: row.driver_id,
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      heading: parseFloat(row.heading),
      speed_kmh: parseFloat(row.speed_kmh),
      is_online: row.is_online,
      last_seen_at: row.last_seen_at,
      progress: row.progress ? parseFloat(row.progress) : null,
      rating: row.rating_average ? parseFloat(row.rating_average) : 0,
      total_trips: row.total_trips ? parseInt(row.total_trips) : 0,
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    }));
  }

  /**
   * Get active rides with driver and passenger positions
   */
  async getActiveRides(dto: GetRidesDto) {
    const activeStatuses = [
      RideStatus.ASSIGNED,
      RideStatus.EN_ROUTE_TO_PICKUP,
      RideStatus.ARRIVED,
      RideStatus.IN_TRIP,
    ];

    let query = `
      SELECT 
        r.id,
        r.status,
        r.pickup_lat,
        r.pickup_lon,
        r.dropoff_lat,
        r.dropoff_lon,
        r.distance_km,
        d.id as driver_id,
        d.user_id as driver_user_id,
        du.first_name as driver_first_name,
        du.last_name as driver_last_name,
        p.id as passenger_id,
        p.user_id as passenger_user_id,
        pu.first_name as passenger_first_name,
        pu.last_name as passenger_last_name,
        dl.latitude as driver_lat,
        dl.longitude as driver_lng,
        dl.progress as driver_progress
      FROM rides r
      LEFT JOIN drivers d ON d.id = r.driver_id
      LEFT JOIN users du ON du.id = d.user_id
      LEFT JOIN passengers p ON p.id = r.passenger_id
      LEFT JOIN users pu ON pu.id = p.user_id
      LEFT JOIN driver_locations dl ON dl.driver_id = d.user_id
      WHERE r.status IN ($1, $2, $3, $4)
    `;

    let params: any[] = activeStatuses;
    let paramIndex = 5;

    // Filter by specific status
    if (dto.status) {
      query = `
        SELECT 
          r.id,
          r.status,
          r.pickup_lat,
          r.pickup_lon,
          r.dropoff_lat,
          r.dropoff_lon,
          r.distance_km,
          d.id as driver_id,
          d.user_id as driver_user_id,
          du.first_name as driver_first_name,
          du.last_name as driver_last_name,
          p.id as passenger_id,
          p.user_id as passenger_user_id,
          pu.first_name as passenger_first_name,
          pu.last_name as passenger_last_name,
          dl.latitude as driver_lat,
          dl.longitude as driver_lng,
          dl.progress as driver_progress
        FROM rides r
        LEFT JOIN drivers d ON d.id = r.driver_id
        LEFT JOIN users du ON du.id = d.user_id
        LEFT JOIN passengers p ON p.id = r.passenger_id
        LEFT JOIN users pu ON pu.id = p.user_id
        LEFT JOIN driver_locations dl ON dl.driver_id = d.user_id
        WHERE r.status = $1
      `;
      params = [dto.status];
      paramIndex = 2;
    }

    // Filter by bounding box (map viewport)
    if (
      dto.lat_min !== undefined &&
      dto.lat_max !== undefined &&
      dto.lng_min !== undefined &&
      dto.lng_max !== undefined
    ) {
      query += ` AND (r.pickup_lat BETWEEN $${paramIndex} AND $${paramIndex + 1} OR r.dropoff_lat BETWEEN $${paramIndex} AND $${paramIndex + 1} OR dl.latitude BETWEEN $${paramIndex} AND $${paramIndex + 1})`;
      params.push(dto.lat_min, dto.lat_max);
      paramIndex += 2;
      query += ` AND (r.pickup_lon BETWEEN $${paramIndex} AND $${paramIndex + 1} OR r.dropoff_lon BETWEEN $${paramIndex} AND $${paramIndex + 1} OR dl.longitude BETWEEN $${paramIndex} AND $${paramIndex + 1})`;
      params.push(dto.lng_min, dto.lng_max);
    }

    query += ` ORDER BY r.created_at DESC`;

    const results = await this.rideRepo.query(query, params);

    return results.map((row: any) => ({
      ride_id: row.id,
      status: row.status,
      pickup_lat: row.pickup_lat ? parseFloat(row.pickup_lat) : null,
      pickup_lon: row.pickup_lon ? parseFloat(row.pickup_lon) : null,
      dropoff_lat: row.dropoff_lat ? parseFloat(row.dropoff_lat) : null,
      dropoff_lon: row.dropoff_lon ? parseFloat(row.dropoff_lon) : null,
      distance_km: row.distance_km ? parseFloat(row.distance_km) : null,
      driver: {
        id: row.driver_id,
        user_id: row.driver_user_id,
        name: `${row.driver_first_name || ''} ${row.driver_last_name || ''}`.trim(),
      },
      passenger: {
        id: row.passenger_id,
        user_id: row.passenger_user_id,
        name: `${row.passenger_first_name || ''} ${row.passenger_last_name || ''}`.trim(),
      },
      driver_location: {
        latitude: row.driver_lat ? parseFloat(row.driver_lat) : null,
        longitude: row.driver_lng ? parseFloat(row.driver_lng) : null,
        progress: row.driver_progress ? parseFloat(row.driver_progress) : null,
      },
    }));
  }

  /**
   * Get drivers within a specific radius of a point
   * Uses PostGIS spatial queries if available, otherwise falls back to Haversine
   */
  async getNearbyDrivers(lat: number, lng: number, radiusMeters: number) {
    const radiusKm = radiusMeters / 1000;

    // Try PostGIS spatial query first
    try {
      const postgisQuery = `
        SELECT 
          dl.driver_id,
          dl.latitude,
          dl.longitude,
          dl.heading,
          dl.speed_kmh,
          dl.is_online,
          dl.last_seen_at,
          dl.progress,
          d.rating_average,
          d.total_trips,
          u.first_name,
          u.last_name,
          ST_Distance(
            ST_SetSRID(ST_MakePoint(dl.longitude, dl.latitude), 4326)::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) / 1000 as distance_km
        FROM driver_locations dl
        LEFT JOIN drivers d ON d.user_id = dl.driver_id
        LEFT JOIN users u ON u.id = dl.driver_id
        WHERE dl.is_online = true
          AND ST_DWithin(
            ST_SetSRID(ST_MakePoint(dl.longitude, dl.latitude), 4326)::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3
          )
        ORDER BY distance_km ASC
      `;

      const results = await this.driverLocationRepo.query(postgisQuery, [
        lng,
        lat,
        radiusMeters,
      ]);

      return results.map((row: any) => ({
        driver_id: row.driver_id,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        heading: parseFloat(row.heading),
        speed_kmh: parseFloat(row.speed_kmh),
        is_online: row.is_online,
        last_seen_at: row.last_seen_at,
        progress: row.progress ? parseFloat(row.progress) : null,
        rating: row.rating_average ? parseFloat(row.rating_average) : 0,
        total_trips: row.total_trips ? parseInt(row.total_trips) : 0,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        distance_km: parseFloat(row.distance_km),
      }));
    } catch (error) {
      // Fallback to Haversine formula if PostGIS not available
      const haversineQuery = `
        SELECT 
          dl.driver_id,
          dl.latitude,
          dl.longitude,
          dl.heading,
          dl.speed_kmh,
          dl.is_online,
          dl.last_seen_at,
          dl.progress,
          d.rating_average,
          d.total_trips,
          u.first_name,
          u.last_name,
          (6371 * acos(
            cos(radians($1)) * cos(radians(dl.latitude)) * 
            cos(radians(dl.longitude) - radians($2)) + 
            sin(radians($1)) * sin(radians(dl.latitude))
          )) as distance_km
        FROM driver_locations dl
        LEFT JOIN drivers d ON d.user_id = dl.driver_id
        LEFT JOIN users u ON u.id = dl.driver_id
        WHERE dl.is_online = true
        HAVING distance_km <= $3
        ORDER BY distance_km ASC
      `;

      const results = await this.driverLocationRepo.query(haversineQuery, [
        lat,
        lng,
        radiusKm,
      ]);

      return results.map((row: any) => ({
        driver_id: row.driver_id,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        heading: parseFloat(row.heading),
        speed_kmh: parseFloat(row.speed_kmh),
        is_online: row.is_online,
        last_seen_at: row.last_seen_at,
        progress: row.progress ? parseFloat(row.progress) : null,
        rating: row.rating_average ? parseFloat(row.rating_average) : 0,
        total_trips: row.total_trips ? parseInt(row.total_trips) : 0,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        distance_km: parseFloat(row.distance_km),
      }));
    }
  }

  /**
   * Get heat map data - driver density by grid cells
   */
  async getHeatmapData(
    latMin: number,
    latMax: number,
    lngMin: number,
    lngMax: number,
    gridSize: number = 0.01,
  ) {
    const query = `
      SELECT 
        FLOOR(latitude / $1) * $1 as grid_lat,
        FLOOR(longitude / $2) * $2 as grid_lng,
        COUNT(*) as driver_count
      FROM driver_locations
      WHERE is_online = true
        AND latitude BETWEEN $3 AND $4
        AND longitude BETWEEN $5 AND $6
      GROUP BY grid_lat, grid_lng
      ORDER BY driver_count DESC
    `;

    const results = await this.driverLocationRepo.query(query, [
      gridSize,
      gridSize,
      latMin,
      latMax,
      lngMin,
      lngMax,
    ]);

    return results.map((row) => ({
      grid_lat: parseFloat(row.grid_lat),
      grid_lng: parseFloat(row.grid_lng),
      driver_count: parseInt(row.driver_count),
    }));
  }
}
