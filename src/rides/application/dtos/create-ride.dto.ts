import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  IsDateString,
} from 'class-validator';

export class CreateRideDto {
  /** Only admin provides this – passengers auto-use their own ID */
  @IsOptional()
  @IsUUID()
  passenger_id?: string;

  @IsUUID()
  @IsNotEmpty()
  class_id: string;

  @IsString()
  @IsNotEmpty()
  pickup_address: string;

  @IsString()
  @IsNotEmpty()
  dropoff_address: string;

  /** Optional – if omitted the address is geocoded automatically */
  @IsOptional()
  @IsNumber()
  pickup_lat?: number;

  @IsOptional()
  @IsNumber()
  pickup_lon?: number;

  @IsOptional()
  @IsNumber()
  dropoff_lat?: number;

  @IsOptional()
  @IsNumber()
  dropoff_lon?: number;

  /** ISO-8601 datetime — when the passenger wants the ride */
  @IsDateString()
  @IsNotEmpty()
  scheduled_at: string;
}
