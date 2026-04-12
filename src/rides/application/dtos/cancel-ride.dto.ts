import { IsOptional, IsString } from 'class-validator';

export class CancelRideDto {
  @IsOptional()
  @IsString()
  cancellation_reason?: string;
}
