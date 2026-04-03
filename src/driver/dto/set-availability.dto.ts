import { IsEnum, IsNotEmpty }       from 'class-validator';
import { DriverAvailabilityStatus } from '../entities/driver.entity';

export class SetAvailabilityDto {
  @IsEnum(DriverAvailabilityStatus) @IsNotEmpty()
  status: DriverAvailabilityStatus;
}