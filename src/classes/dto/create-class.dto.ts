import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  MinLength,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

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
}