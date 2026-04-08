import { IsEnum, IsNotEmpty } from 'class-validator';
import { DriverAvailabilityStatus } from '../entities/driver.entity';

// Only online/offline are driver-controllable — pending & setup_required are system-managed
export enum DriverToggleStatus {
  OFFLINE = 'offline',
  ONLINE  = 'online',
}

export class SetAvailabilityDto {
  @IsEnum(DriverToggleStatus)
  @IsNotEmpty()
  status: DriverToggleStatus;
}