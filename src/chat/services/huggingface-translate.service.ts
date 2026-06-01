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
  private readonly apiKey = process.env.HUGGINGFACE_API_KEY;
  private readonly model = 'facebook/nllb-200-distilled-600M';
  private readonly apiUrl = `https://api-inference.huggingface.co/models/${this.model}`;

  constructor() {
    if (!this.apiKey) {
      this.logger.warn('HUGGINGFACE_API_KEY not set - translation will fail');
    } else {
      this.logger.log(`HuggingFace Translate configured with model: ${this.model}`);
    }
  }

  /**
   * Translate text to target language using Hugging Face Inference API.
   * Uses NLLB-200 model which supports 200+ languages.
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
    if (!this.apiKey) {
      throw new Error('HUGGINGFACE_API_KEY not configured');
    }

    try {
      this.logger.log(
        `[HuggingFace] Requesting translation to ${targetLang} for: "${text.substring(0, 30)}..."`,
      );

      // NLLB-200 expects language codes in specific format (e.g., 'eng_Latn', 'fra_Latn', 'arb_Arab')
      const targetLangCode = this.normalizeLanguageCode(targetLang);
      const sourceLangCode = sourceLang ? this.normalizeLanguageCode(sourceLang) : undefined;

      const body: any = {
        inputs: text,
        parameters: {
          target_lang: targetLangCode,
        },
      };

      if (sourceLangCode) {
        body.parameters.source_lang = sourceLangCode;
      }

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `[HuggingFace] API error ${response.status}: ${errorText}`,
        );
        throw new Error(
          `HuggingFace API error: ${response.status} - ${errorText}`,
        );
      }

      const data = await response.json();
      
      // Hugging Face NLLB model returns: [{ translation_text: "..." }]
      const translatedText = Array.isArray(data) ? data[0]?.translation_text : data?.translation_text;
      
      if (!translatedText) {
        throw new Error('No translation returned from Hugging Face API');
      }

      this.logger.log(
        `[HuggingFace] Successfully translated to ${targetLang}: "${translatedText.substring(0, 30)}..."`,
      );
      
      return translatedText;
    } catch (error) {
      this.logger.error(
        `[HuggingFace] Translation failed for "${text.substring(0, 30)}...": ${error}`,
      );
      throw error;
    }
  }

  /**
   * Detect the language of a text.
   * Note: NLLB-200 doesn't have a dedicated detect endpoint, so we'll use a simple heuristic
   * or return the source language if provided during translation.
   * For now, we'll return 'en' as fallback.
   */
  async detectLanguage(text: string): Promise<string> {
    // NLLB-200 doesn't have a dedicated language detection endpoint
    // In a production environment, you might want to use a separate language detection model
    // For now, we'll return a default or implement a simple heuristic
    this.logger.warn('[HuggingFace] Language detection not fully implemented - returning "en" as fallback');
    return 'en';
  }

  /**
   * Normalize language codes to NLLB-200 format.
   * Maps common ISO codes to NLLB format (e.g., 'en' -> 'eng_Latn', 'fr' -> 'fra_Latn')
   */
  private normalizeLanguageCode(lang: string): string {
    const langMap: Record<string, string> = {
      'en': 'eng_Latn',
      'fr': 'fra_Latn',
      'ar': 'arb_Arab',
      'es': 'spa_Latn',
      'de': 'deu_Latn',
      'it': 'ita_Latn',
      'pt': 'por_Latn',
      'tr': 'tur_Latn',
      'ru': 'rus_Cyrl',
      'zh': 'zho_Hans',
      'ja': 'jpn_Jpan',
      'ko': 'kor_Hang',
    };

    const normalized = lang.toLowerCase().trim();
    return langMap[normalized] || `${normalized}_Latn`;
  }
}
