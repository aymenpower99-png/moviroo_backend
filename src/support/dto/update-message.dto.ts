import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateMessageDto {
  @IsString() @IsNotEmpty()
  body: string;
}
