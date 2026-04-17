import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HelpArticle, ArticleStatus } from './entities/help-article.entity';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';

@Injectable()
export class HelpCenterService {
  constructor(
    @InjectRepository(HelpArticle)
    private readonly repo: Repository<HelpArticle>,
  ) {}

  // ── Public: get articles for a language ──
  async getArticles(lang: string = 'en') {
    const articles = await this.repo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });

    return articles.map(a => ({
      id: a.id,
      title: a.title[lang] || a.title['en'] || '',
      description: a.description[lang] || a.description['en'] || '',
      categoryKey: a.categoryKey,
      categoryLabel: a.categoryLabel[lang] || a.categoryLabel['en'] || a.categoryKey,
      status: a.status,
    }));
  }

  // ── Admin: list all articles (raw JSONB) ──
  async adminListAll() {
    return this.repo.find({ order: { sortOrder: 'ASC', createdAt: 'DESC' } });
  }

  // ── Admin: get single article ──
  async adminGetOne(id: string) {
    const article = await this.repo.findOne({ where: { id } });
    if (!article) throw new NotFoundException('Article not found');
    return article;
  }

  // ── Admin: create article ──
  async createArticle(dto: CreateArticleDto) {
    const article = this.repo.create({
      title: { en: dto.title },
      description: { en: dto.description },
      categoryKey: dto.categoryKey,
      categoryLabel: { en: dto.categoryLabel || dto.categoryKey },
      sortOrder: dto.sortOrder ?? 0,
      status: ArticleStatus.AUTO,
    });
    return this.repo.save(article);
  }

  // ── Admin: update article (supports multi-lang edits) ──
  async updateArticle(id: string, dto: UpdateArticleDto) {
    const article = await this.adminGetOne(id);
    if (dto.title) article.title = { ...article.title, ...dto.title };
    if (dto.description) article.description = { ...article.description, ...dto.description };
    if (dto.categoryKey) article.categoryKey = dto.categoryKey;
    if (dto.categoryLabel) article.categoryLabel = { ...article.categoryLabel, ...dto.categoryLabel };
    if (dto.status) article.status = dto.status;
    if (dto.isActive !== undefined) article.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) article.sortOrder = dto.sortOrder;
    return this.repo.save(article);
  }

  // ── Admin: soft-delete ──
  async deleteArticle(id: string) {
    const article = await this.adminGetOne(id);
    article.isActive = false;
    return this.repo.save(article);
  }

  // ── Get unique categories ──
  async getCategories(lang: string = 'en') {
    const articles = await this.repo.find({
      where: { isActive: true },
      select: ['categoryKey', 'categoryLabel'],
    });
    
    const seen = new Set<string>();
    const categories: { key: string; label: string }[] = [];
    for (const a of articles) {
      if (!seen.has(a.categoryKey)) {
        seen.add(a.categoryKey);
        categories.push({
          key: a.categoryKey,
          label: a.categoryLabel[lang] || a.categoryLabel['en'] || a.categoryKey,
        });
      }
    }
    return categories;
  }
}
