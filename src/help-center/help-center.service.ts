import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HelpArticle, ArticleStatus } from './entities/help-article.entity';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';

const AUTO_TRANSLATE_LANGS = ['fr', 'ar'];

@Injectable()
export class HelpCenterService {
  constructor(
    @InjectRepository(HelpArticle)
    private readonly repo: Repository<HelpArticle>,
  ) {}

  // ── Internal: call MyMemory free translation API ──
  private async translateText(text: string, targetLang: string): Promise<string> {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        responseStatus: number;
        responseData?: { translatedText?: string };
      };
      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        return data.responseData.translatedText;
      }
    } catch { /* fall through to EN fallback */ }
    return text;
  }

  // ── Internal: auto-translate missing languages in background ──
  private async autoTranslateArticle(article: HelpArticle): Promise<void> {
    const title: Record<string, string> = { ...article.title };
    const description: Record<string, string> = { ...article.description };
    let changed = false;

    for (const lang of AUTO_TRANSLATE_LANGS) {
      if (!title[lang] && title['en']) {
        title[lang] = await this.translateText(title['en'], lang);
        changed = true;
      }
      if (!description[lang] && description['en']) {
        description[lang] = await this.translateText(description['en'], lang);
        changed = true;
      }
    }

    if (changed) {
      await this.repo.update(article.id, { title, description });
    }
  }

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
    const saved = await this.repo.save(article);
    // Trigger auto-translation in background (non-blocking)
    this.autoTranslateArticle(saved).catch(() => {});
    return saved;
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
    const saved = await this.repo.save(article);
    // Re-translate if EN content changed
    if (dto.title?.en || dto.description?.en) {
      this.autoTranslateArticle(saved).catch(() => {});
    }
    return saved;
  }

  // ── Admin: hard-delete ──
  async deleteArticle(id: string): Promise<void> {
    const article = await this.adminGetOne(id);
    await this.repo.remove(article);
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
