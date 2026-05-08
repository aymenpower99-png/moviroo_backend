import { IsString, IsObject, IsOptional } from 'class-validator';

export class WebAuthnAuthenticateFinishDto {
  @IsString()
  optionsId: string;

  @IsString()
  id: string;

  @IsString()
  rawId: string;

  @IsObject()
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };

  @IsString()
  type: string;

  @IsOptional()
  @IsObject()
  clientExtensionResults?: Record<string, unknown>;
}
