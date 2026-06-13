import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import axios, { AxiosError } from 'axios';

/* ───────────────────────────────────────────────────────────────────────────
   RENDER VOICE SERVICE — HIDDEN (kept for reference, not active)
   ───────────────────────────────────────────────────────────────────────────
   This is the external Render API implementation. It is kept in the codebase
   but is NOT used by the VoiceModule. To re-activate it, swap the provider
   in voice.module.ts back to RenderVoiceService.
   ─────────────────────────────────────────────────────────────────────────── */
@Injectable()
export class RenderVoiceService {
  private readonly logger = new Logger(RenderVoiceService.name);
  private readonly VOICE_API_URL: string;
  private readonly VOICE_API_KEY: string;
  private readonly REQUEST_TIMEOUT_MS = 300000; // 300s for Render cold starts + model loading

  constructor(private readonly config: ConfigService) {
    this.VOICE_API_URL =
      this.config.get<string>('VOICE_API_URL') ?? 'http://localhost:8005';
    this.VOICE_API_KEY =
      this.config.get<string>('VOICE_API_KEY') ?? '';
  }

  private getHeaders(formData: FormData) {
    const headers: Record<string, string> = {
      ...formData.getHeaders(),
    };
    if (this.VOICE_API_KEY) {
      headers['X-API-Key'] = this.VOICE_API_KEY;
    }
    return headers;
  }

  private handleError(error: unknown, operation: string) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `${operation} failed: ${axiosError.message} (status: ${axiosError.response?.status})`,
      );
      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        throw new ServiceUnavailableException(
          'Voice processing is taking longer than expected. Please try again.',
        );
      }
      if (axiosError.response?.status === 404) {
        throw new ServiceUnavailableException(
          'Voice service temporarily unavailable. Please try again.',
        );
      }
      if (axiosError.response?.status === 500) {
        throw new ServiceUnavailableException(
          'Voice processing failed. Please try again.',
        );
      }
      throw new ServiceUnavailableException(
        (axiosError.response?.data as any)?.error || 'Voice service error. Please try again.',
      );
    }
    this.logger.error(`${operation} failed: ${(error as Error).message}`);
    throw new ServiceUnavailableException(
      'Voice service temporarily unavailable. Please try again.',
    );
  }

  async transcribe(file: Express.Multer.File) {
    this.logger.log(
      `Transcribing file: ${file.originalname}, size: ${file.size}, mimetype: ${file.mimetype}`,
    );

    const formData = new FormData();
    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    try {
      const response = await axios.post(
        `${this.VOICE_API_URL}/transcribe`,
        formData,
        {
          headers: this.getHeaders(formData),
          timeout: this.REQUEST_TIMEOUT_MS,
        },
      );
      this.logger.log(`Voice API responded with status ${response.status}`);
      return response.data;
    } catch (error) {
      this.handleError(error, 'Transcribe');
    }
  }

  async answer(
    file: Express.Multer.File,
    body: {
      field: string;
      language: string;
      destination?: string;
      departure?: string;
      date?: string;
      time?: string;
    },
  ) {
    const formData = new FormData();
    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    const params = new URLSearchParams();
    params.append('field', body.field);
    params.append('language', body.language);
    if (body.destination) params.append('destination', body.destination);
    if (body.departure) params.append('departure', body.departure);
    if (body.date) params.append('date', body.date);
    if (body.time) params.append('time', body.time);

    try {
      const response = await axios.post(
        `${this.VOICE_API_URL}/answer?${params.toString()}`,
        formData,
        {
          headers: this.getHeaders(formData),
          timeout: this.REQUEST_TIMEOUT_MS,
        },
      );
      return response.data;
    } catch (error) {
      this.handleError(error, 'Answer');
    }
  }

  async healthCheck(): Promise<{ status: string; model: string } | null> {
    try {
      const response = await axios.get(`${this.VOICE_API_URL}/health`, {
        headers: this.VOICE_API_KEY ? { 'X-API-Key': this.VOICE_API_KEY } : {},
        timeout: 30000,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        this.logger.warn(
          `Voice engine health check failed: ${axiosError.message} (status: ${axiosError.response?.status}, code: ${axiosError.code})`,
        );
      } else {
        this.logger.warn('Voice engine health check failed');
      }
      return null;
    }
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   LOCAL VOICE SERVICE — ACTIVE (calls the local ML engine in the project)
   ───────────────────────────────────────────────────────────────────────────
   This service calls the local ML voice engine (main.py) that runs inside
   the ML-voice-search-engine project on port 8005.
   Endpoints:
     POST /transcribe  → audio → {text, language, intent, destination, ...}
     POST /answer      → audio + context → merged result
     GET  /health      → { status, whisper, ner }
   ─────────────────────────────────────────────────────────────────────────── */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly LOCAL_VOICE_API_URL: string;
  private readonly REQUEST_TIMEOUT_MS = 60000; // 60s for local processing

  constructor(private readonly config: ConfigService) {
    this.LOCAL_VOICE_API_URL =
      this.config.get<string>('LOCAL_VOICE_API_URL') ?? 'http://localhost:8005';
  }

  private handleError(error: unknown, operation: string) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `${operation} failed: ${axiosError.message} (status: ${axiosError.response?.status})`,
      );
      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        throw new ServiceUnavailableException(
          'Voice processing is taking longer than expected. Please try again.',
        );
      }
      if (axiosError.response?.status === 404) {
        throw new ServiceUnavailableException(
          'Voice service endpoint not found. Is the local engine running?',
        );
      }
      throw new ServiceUnavailableException(
        (axiosError.response?.data as any)?.error || 'Voice service error. Please try again.',
      );
    }
    this.logger.error(`${operation} failed: ${(error as Error).message}`);
    throw new ServiceUnavailableException(
      'Voice service temporarily unavailable. Please try again.',
    );
  }

  async transcribe(file: Express.Multer.File) {
    this.logger.log(
      `Transcribing via local engine: ${file.originalname}, size: ${file.size}, mimetype: ${file.mimetype}`,
    );

    const formData = new FormData();
    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    try {
      const response = await axios.post(
        `${this.LOCAL_VOICE_API_URL}/transcribe`,
        formData,
        {
          headers: { ...formData.getHeaders() },
          timeout: this.REQUEST_TIMEOUT_MS,
        },
      );
      this.logger.log(`Local voice engine responded with status ${response.status}`);
      return response.data;
    } catch (error) {
      this.handleError(error, 'Transcribe');
    }
  }

  async answer(
    file: Express.Multer.File,
    body: {
      field: string;
      language: string;
      destination?: string;
      departure?: string;
      date?: string;
      time?: string;
    },
  ) {
    this.logger.log(
      `Answering via local engine: ${file.originalname}, field: ${body.field}`,
    );

    const formData = new FormData();
    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    const params = new URLSearchParams();
    params.append('field', body.field);
    params.append('language', body.language);
    if (body.destination) params.append('destination', body.destination);
    if (body.departure) params.append('departure', body.departure);
    if (body.date) params.append('date', body.date);
    if (body.time) params.append('time', body.time);

    try {
      const response = await axios.post(
        `${this.LOCAL_VOICE_API_URL}/answer?${params.toString()}`,
        formData,
        {
          headers: { ...formData.getHeaders() },
          timeout: this.REQUEST_TIMEOUT_MS,
        },
      );
      return response.data;
    } catch (error) {
      this.handleError(error, 'Answer');
    }
  }

  async healthCheck(): Promise<{ status: string; model: string } | null> {
    try {
      const response = await axios.get(`${this.LOCAL_VOICE_API_URL}/health`, {
        timeout: 10000,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        this.logger.warn(
          `Local voice engine health check failed: ${axiosError.message} (status: ${axiosError.response?.status}, code: ${axiosError.code})`,
        );
      } else {
        this.logger.warn('Local voice engine health check failed');
      }
      return null;
    }
  }
}
