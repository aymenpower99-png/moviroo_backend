import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AppleSignInDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @IsString()
  @IsOptional()
  fullName?: string;
}
