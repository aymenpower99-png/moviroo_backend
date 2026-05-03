import {
  IsString,
  MinLength,
  MaxLength,
  IsInt,
  Min,
  IsNumber,
  Max,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreateMembershipLevelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsInt()
  @Min(0)
  requiredPoints: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercentage: number;

  @IsInt()
  @Min(0)
  order: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
