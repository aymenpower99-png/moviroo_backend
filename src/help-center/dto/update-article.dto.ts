import { IsOptional, IsObject, IsString, IsNumber, IsEnum, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ArticleStatus } from '../entities/help-article.entity';
import { StepInput } from './create-article.dto';

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepInput)
  steps?: StepInput[];
}
