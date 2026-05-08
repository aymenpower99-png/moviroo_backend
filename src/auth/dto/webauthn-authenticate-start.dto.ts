import { IsOptional, IsString } from 'class-validator';

export class WebAuthnAuthenticateStartDto {
  @IsOptional()
  @IsString()
  email?: string;
}
