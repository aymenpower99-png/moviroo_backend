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
   * Locked price from vehicle selection screen (exactPrice).
   * When provided, the backend skips the ML pricing API and uses this value
   * directly, ensuring price consistency between vehicle selection and payment.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  price_override?: number;

  /** Loyalty points from vehicle selection (used when price_override is set) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  loyalty_points_override?: number;

  /** Distance in km from vehicle selection (used when price_override is set) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  distance_km_override?: number;

  /** Duration in minutes from vehicle selection (used when price_override is set) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  duration_min_override?: number;

  /** Surge multiplier from vehicle selection (used when price_override is set) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  surge_override?: number;
}
