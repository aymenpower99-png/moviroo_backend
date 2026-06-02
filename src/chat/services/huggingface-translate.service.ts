import { Injectable, Logger } from '@nestjs/common';

export interface TranslateResponse {
  translatedText: string;
}

export interface DetectResponse {
  confidence: number;
  language: string;
}

@Injectable()
export class HuggingFaceTranslateService {
  private readonly logger = new Logger(HuggingFaceTranslateService.name);
  private readonly deepLApiKey = process.env.DEEPL_API_KEY;
  private readonly deepLApiUrl = 'https://api-free.deepl.com/v2/translate';

  constructor() {
    if (!this.deepLApiKey) {
      this.logger.warn('DEEPL_API_KEY not set - translation will fail');
    } else {
      this.logger.log('Translation service initialized with DeepL API');
    }
  }

  /**
   * Translate text to target language using DeepL API.
   * DeepL supports many languages with high quality translations.
   *
   * @param text - Text to translate
   * @param targetLang - Target language code (e.g., 'en', 'fr', 'ar', 'es')
   * @param sourceLang - Source language code (optional, auto-detected if not provided)
   * @returns Translated text
   */
  async translate(
    text: string,
    targetLang: string,
    sourceLang?: string,
  ): Promise<string> {
    if (!this.deepLApiKey) {
      throw new Error('DEEPL_API_KEY not configured');
    }

    try {
      this.logger.log(
        `[DeepL] Requesting translation to ${targetLang} for: "${text.substring(0, 30)}..."`,
      );

      // DeepL uses different language codes (e.g., 'EN-US', 'FR', 'AR')
      const deepLTargetLang = this.normalizeDeepLLangCode(targetLang);
      const deepLSourceLang = sourceLang
        ? this.normalizeDeepLLangCode(sourceLang)
        : undefined;

      const body = new URLSearchParams();
      body.append('text', text);
      body.append('target_lang', deepLTargetLang);
      if (deepLSourceLang) {
        body.append('source_lang', deepLSourceLang);
      }

      const headers: Record<string, string> = {
        Authorization: `DeepL-Auth-Key ${this.deepLApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      const response = await fetch(this.deepLApiUrl, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`[DeepL] API error ${response.status}: ${errorText}`);
        throw new Error(`DeepL API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const translatedText = data.translations?.[0]?.text;

      if (!translatedText) {
        throw new Error('No translation returned from DeepL API');
      }

      this.logger.log(
        `[DeepL] Successfully translated to ${targetLang}: "${translatedText.substring(0, 30)}..."`,
      );

      return translatedText;
    } catch (error) {
      this.logger.error(
        `[DeepL] Translation failed for "${text.substring(0, 30)}...": ${error}`,
      );
      throw error;
    }
  }

  /**
   * Normalize language codes to DeepL format.
   * Maps common ISO codes to DeepL format (e.g., 'en' -> 'EN-US', 'fr' -> 'FR')
   */
  private normalizeDeepLLangCode(lang: string): string {
    const langMap: Record<string, string> = {
      en: 'EN-US',
      fr: 'FR',
      ar: 'AR',
      es: 'ES-ES',
      de: 'DE',
      it: 'IT',
      pt: 'PT-PT',
      tr: 'TR',
      ru: 'RU',
      zh: 'ZH',
      ja: 'JA',
      ko: 'KO',
    };

    const normalized = lang.toLowerCase().trim();
    return langMap[normalized] || normalized.toUpperCase();
  }

  /**
   * Detect the language of a text using script-based heuristics.
   * DeepL has auto-detection, so this is only used for optimization.
   * Returns undefined to let DeepL auto-detect.
   */
  async detectLanguage(text: string): Promise<string | undefined> {
    // Script-based detection for common languages
    if (
      /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
        text,
      )
    ) {
      return 'ar';
    }
    if (/[\u0400-\u04FF]/.test(text)) {
      return 'ru';
    }
    if (/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(text)) {
      return 'zh';
    }

    // Latin script or unknown — let DeepL auto-detect
    return undefined;
  }
}
