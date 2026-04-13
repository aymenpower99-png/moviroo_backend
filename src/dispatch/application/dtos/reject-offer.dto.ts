import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectOfferDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
