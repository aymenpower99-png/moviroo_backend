import { IsString, MinLength } from 'class-validator';

export class CreateWorkAreaDto {
  @IsString()
  @MinLength(1)
  country: string;

  @IsString()
  @MinLength(1)
  ville: string;
}