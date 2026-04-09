import { IsUUID, IsOptional } from 'class-validator';

export class AssignWorkAreaDto {
  @IsUUID()
  @IsOptional()
  workAreaId?: string | null;
}