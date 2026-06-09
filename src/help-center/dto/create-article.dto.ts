import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ArticleStatus } from '../entities/help-article.entity';

export class StepInput {
  @IsNumber()
  order: number;

  @IsString()
  title: string; // English only — backend auto-translates to fr/ar

  @IsString()
  description: string; // English only
}

export class CreateArticleDto {
  @IsString()
  title: string; // English title

  @IsString()
  description: string; // English description/body

  @IsString()
  categoryKey: string; // 'account', 'payments', etc.

  @IsOptional()
  @IsString()
  categoryLabel?: string; // English label like "Account"

  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepInput)
  steps?: StepInput[];
}
