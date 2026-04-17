import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateArticleDto {
  @IsString()
  title: string;  // English title

  @IsString()
  description: string;  // English description/body

  @IsString()
  categoryKey: string;  // 'account', 'payments', etc.

  @IsOptional()
  @IsString()
  categoryLabel?: string;  // English label like "Account"

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
