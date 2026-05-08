import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import axios from 'axios';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly VOICE_API_URL: string;

  constructor(private readonly config: ConfigService) {
    this.VOICE_API_URL =
      this.config.get<string>('VOICE_API_URL') ?? 'http://localhost:8005';
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
          headers: formData.getHeaders(),
        },
      );
      this.logger.log(`Voice API responded with status ${response.status}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Voice API error: ${error.message}`);
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Response data: ${JSON.stringify(error.response?.data)}`,
        );
      }
      throw error;
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

    const response = await axios.post(
      `${this.VOICE_API_URL}/answer?${params.toString()}`,
      formData,
      {
        headers: formData.getHeaders(),
      },
    );

    return response.data;
  }
}
