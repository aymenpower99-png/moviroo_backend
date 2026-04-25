import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsNumber,
  MinLength,
  MaxLength,
  Min,
  Max,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExtraFeatureItemDto {
  @IsString()
  name: string;

  @IsBoolean()
  enabled: boolean;
}

export class CreateClassDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  seats?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  bags?: number;

  @IsOptional()
  @IsBoolean()
  wifi?: boolean;

  @IsOptional()
  @IsBoolean()
  ac?: boolean;

  @IsOptional()
  @IsBoolean()
  water?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  freeWaitingTime?: number;

  @IsOptional()
  @IsBoolean()
  doorToDoor?: boolean;

  @IsOptional()
  @IsBoolean()
  meetAndGreet?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraFeatureItemDto)
  extraFeatures?: ExtraFeatureItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraFeatureItemDto)
  extraServices?: ExtraFeatureItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10.0)
  multiplier?: number;
}
