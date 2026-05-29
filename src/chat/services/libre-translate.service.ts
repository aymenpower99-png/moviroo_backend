import { Injectable, Logger } from '@nestjs/common';

export interface TranslateResponse {
  translatedText: string;
}

export interface DetectResponse {
  confidence: number;
  language: string;
}

@Injectable()
export class LibreTranslateService {
  private readonly logger = new Logger(LibreTranslateService.name);
  private readonly apiUrl = process.env.LIBRETRANSLATE_API_URL || 'https://libretranslate.de';

  /**
   * Translate text to target language using LibreTranslate.
   * Auto-detects source language if not specified.
   */
  async translate(
    text: string,
    targetLang: string,
    sourceLang?: string,
  ): Promise<string> {
    try {
      const body: any = {
        q: text,
        target: targetLang,
        format: 'text',
      };

      if (sourceLang) {
        body.source = sourceLang;
      }

      const response = await fetch(`${this.apiUrl}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`LibreTranslate API error: ${response.status}`);
      }

      const data = (await response.json()) as TranslateResponse;
      this.logger.log(
        `[LibreTranslate] Translated "${text.substring(0, 30)}..." to ${targetLang}`,
      );
      return data.translatedText;
    } catch (error) {
      this.logger.error(
        `[LibreTranslate] Translation failed: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Detect the language of a text.
   */
  async detectLanguage(text: string): Promise<string> {
    try {
      const response = await fetch(`${this.apiUrl}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text }),
      });

      if (!response.ok) {
        throw new Error(`LibreTranslate detect error: ${response.status}`);
      }

      const data = (await response.json()) as DetectResponse[];
      return data[0]?.language || 'en';
    } catch (error) {
      this.logger.error(
        `[LibreTranslate] Language detection failed: ${error}`,
      );
      return 'en'; // fallback to English
    }
  }
}
