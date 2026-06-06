import { IsOptional, IsNumber, IsBoolean, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { DriverAvailabilityStatus } from '../../../driver/entities/driver.entity';

export class GetDriversDto {
  @IsOptional()
  @IsEnum(DriverAvailabilityStatus)
  status?: DriverAvailabilityStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  @Type(() => Number)
  rating_min?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  online_only?: boolean;

  // Bounding box for map viewport filtering
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat_min?: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat_max?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng_min?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng_max?: number;
}
