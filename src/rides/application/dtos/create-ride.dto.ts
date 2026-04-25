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
}
