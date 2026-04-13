import { IsOptional, IsInt, Min, Max, IsString, MaxLength } from 'class-validator';

export class SubmitRatingDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  passenger_rating?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  driver_rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  passenger_comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  driver_comment?: string;
}
