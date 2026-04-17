import { IsOptional, IsObject, IsString, IsNumber, IsEnum, IsBoolean } from 'class-validator';
import { ArticleStatus } from '../entities/help-article.entity';

export class UpdateArticleDto {
  @IsOptional()
  @IsObject()
  title?: Record<string, string>;

  @IsOptional()
  @IsObject()
  description?: Record<string, string>;

  @IsOptional()
  @IsString()
  categoryKey?: string;

  @IsOptional()
  @IsObject()
  categoryLabel?: Record<string, string>;

  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
