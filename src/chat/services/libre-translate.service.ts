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
  private readonly apiUrl =
    process.env.LIBRETRANSLATE_API_URL || 'https://libretranslate.de';

  constructor() {
    this.logger.log(`LibreTranslate configured with API URL: ${this.apiUrl}`);
  }

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

      this.logger.log(
        `[LibreTranslate] Requesting translation to ${targetLang} for: "${text.substring(0, 30)}..."`,
      );

      const response = await fetch(`${this.apiUrl}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `[LibreTranslate] API error ${response.status}: ${errorText}`,
        );
        throw new Error(
          `LibreTranslate API error: ${response.status} - ${errorText}`,
        );
      }

      const data = (await response.json()) as TranslateResponse;
      this.logger.log(
        `[LibreTranslate] Successfully translated to ${targetLang}: "${data.translatedText.substring(0, 30)}..."`,
      );
      return data.translatedText;
    } catch (error) {
      this.logger.error(
        `[LibreTranslate] Translation failed for "${text.substring(0, 30)}...": ${error}`,
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
      this.logger.error(`[LibreTranslate] Language detection failed: ${error}`);
      return 'en'; // fallback to English
    }
  }
}
