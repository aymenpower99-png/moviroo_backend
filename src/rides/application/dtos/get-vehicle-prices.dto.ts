import { IsNumber, IsOptional, Min, Max, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query parameters for getting vehicle class prices by coordinates
 */
export class GetVehiclePricesDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  pickupLat: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  pickupLon: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  dropoffLat: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  dropoffLon: number;

  @IsOptional()
  @IsISO8601()
  bookingDt?: string;
}

/**
 * Single vehicle class with calculated price
 */
export interface VehicleClassPrice {
  id: string;
  name: string;
  imageUrl: string | null;
  seats: number;
  bags: number;
  priceTnd: number;
  exactPrice: number;
  distanceKm: number;
  durationMin: number;
  surgeMultiplier: number;
  loyaltyPoints: number;
}

/**
 * Response containing all vehicle classes with their prices
 */
export interface GetVehiclePricesResponse {
  vehicleClasses: VehicleClassPrice[];
  pickupLat: number;
  pickupLon: number;
  dropoffLat: number;
  dropoffLon: number;
}
