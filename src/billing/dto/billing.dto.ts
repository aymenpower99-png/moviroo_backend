import { IsOptional, IsEnum, IsString } from 'class-validator';
import { PaymentStatus } from '../entities/trip-payment.entity';

export class PaymentFilterDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}

export class EarningsFilterDto {
  @IsOptional()
  @IsString()
  month?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
