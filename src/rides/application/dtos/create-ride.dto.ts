import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  IsDateString,
  Min,
  Max,
} from 'class-validator';

export class CreateRideDto {
  /** Only admin provides this – passengers auto-use their own ID */
  @IsOptional()
  @IsUUID()
  passenger_id?: string;

  @IsOptional()
  @IsUUID()
  class_id?: string;

  /** Pickup coordinates (required - backend will re-geocode for display name) */
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsNotEmpty()
  pickup_lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsNotEmpty()
  pickup_lon: number;

  /** Dropoff coordinates (required - backend will re-geocode for display name) */
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsNotEmpty()
  dropoff_lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsNotEmpty()
  dropoff_lon: number;

  /** Optional display names (will be overwritten by backend re-geocoding) */
  @IsOptional()
  @IsString()
  pickup_address?: string;

  @IsOptional()
  @IsString()
  dropoff_address?: string;

  /** ISO-8601 datetime — when the passenger wants the ride */
  @IsDateString()
  @IsNotEmpty()
  scheduled_at: string;

  /** Optional coupon code to apply a membership discount */
  @IsOptional()
  @IsString()
  coupon_code?: string;

  /** Discount percentage from coupon (0–100) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discount_percent?: number;

  /**
   * ML price locked at vehicle selection.
   * The backend uses this directly and skips a second ML call,
   * ensuring price consistency across the entire ride flow.
   * Only absent for admin-created rides (which fall back to a live ML call).
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  locked_price?: number;

  /** ML loyalty points locked at vehicle selection. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  locked_loyalty_points?: number;

  /** ML distance (km) locked at vehicle selection. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  locked_distance_km?: number;

  /** ML duration (min) locked at vehicle selection. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  locked_duration_min?: number;

  /** ML surge multiplier locked at vehicle selection. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  locked_surge?: number;

  /** Number of passengers chosen by the passenger at booking time. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  passenger_count?: number;
}
