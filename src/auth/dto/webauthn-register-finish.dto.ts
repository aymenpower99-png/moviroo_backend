import { IsOptional, IsString, IsObject } from 'class-validator';

export class WebAuthnRegisterFinishDto {
  @IsString()
  optionsId: string;

  @IsString()
  id: string;

  @IsString()
  rawId: string;

  @IsObject()
  response: {
    clientDataJSON: string;
    attestationObject: string;
    authenticatorData?: string;
    transports?: string[];
    publicKeyAlgorithm?: number;
    publicKey?: string;
  };

  @IsString()
  type: string;

  @IsOptional()
  @IsObject()
  clientExtensionResults?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  deviceName?: string;
}
