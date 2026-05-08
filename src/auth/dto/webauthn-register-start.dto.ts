import { IsOptional, IsString } from 'class-validator';

export class WebAuthnRegisterStartDto {
  @IsOptional()
  @IsString()
  deviceName?: string;
}
