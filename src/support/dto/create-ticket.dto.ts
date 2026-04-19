import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TicketCategory } from '../entities/support-ticket.entity';

export class CreateTicketDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  subject: string;

  @IsString() @IsNotEmpty()
  description: string;

  @IsEnum(TicketCategory)
  category: TicketCategory;

  @IsOptional()
  @IsUUID()
  rideId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}