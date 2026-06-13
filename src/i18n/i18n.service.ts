import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class I18nService {
  private readonly logger = new Logger(I18nService.name);
  private readonly translations: Record<string, Record<string, string>> = {};

  constructor() {
    this.loadTranslations();
  }

  private loadTranslations() {
    const possiblePaths = [
      // Production / relative to backend dist
      path.join(__dirname, '..', '..', '..', 'flutter-apps', 'driver_movirooo_app-main', 'data', 'translations'),
      // Development / relative to backend src
      path.join(process.cwd(), '..', '..', 'flutter-apps', 'driver_movirooo_app-main', 'data', 'translations'),
      // Alternative path
      path.join(process.cwd(), '..', '..', '..', 'flutter-apps', 'driver_movirooo_app-main', 'data', 'translations'),
    ];

    for (const basePath of possiblePaths) {
      if (fs.existsSync(basePath)) {
        this.logger.log(`Loading translations from ${basePath}`);
        for (const lang of ['en', 'fr', 'ar']) {
          const filePath = path.join(basePath, `${lang}.json`);
          try {
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, 'utf-8');
              this.translations[lang] = JSON.parse(content);
              this.logger.log(`Loaded ${lang} translations (${Object.keys(this.translations[lang]).length} keys)`);
            }
          } catch (e) {
            this.logger.warn(`Failed to load translations for ${lang}: ${e.message}`);
          }
        }
        break;
      }
    }

    if (Object.keys(this.translations).length === 0) {
      this.logger.warn('No translation files found. Driver notifications will be in English.');
    }
  }

  /**
   * Translate a key into the target language.
   * Falls back to English if the key is missing in the target language.
   * Returns the key itself as last resort.
   */
  translate(key: string, lang: string): string {
    const targetLang = (lang || 'en').trim().toLowerCase();
    const target = this.translations[targetLang]?.[key];
    if (target) return target;
    if (targetLang !== 'en') {
      const fallback = this.translations['en']?.[key];
      if (fallback) return fallback;
    }
    return key;
  }

  /**
   * Interpolate placeholders in a translated string.
   * e.g. "You reached {monthlyRides} rides" with { monthlyRides: 10 } => "You reached 10 rides"
   */
  interpolate(text: string, params: Record<string, string | number>): string {
    let result = text;
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    return result;
  }
}
