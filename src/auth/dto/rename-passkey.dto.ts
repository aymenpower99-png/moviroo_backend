import { IsString, MinLength, MaxLength } from 'class-validator';

export class RenamePasskeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  deviceName: string;
}
