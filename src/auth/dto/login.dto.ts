import { IsEmail, IsString, IsEnum } from 'class-validator';

export enum AppType {
  DRIVER = 'driver',
  PASSENGER = 'passenger',
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsEnum(AppType)
  appType: AppType;
}
