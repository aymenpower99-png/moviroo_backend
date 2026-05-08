import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VoiceService } from '../voice/voice.service';

@Controller('voice')
export class VoiceController {
  private readonly logger = new Logger(VoiceController.name);
  constructor(private readonly voiceService: VoiceService) {}

  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async transcribe(@UploadedFile() file: Express.Multer.File) {
    this.logger.log(
      `transcribe called - file: ${file ? `${file.originalname} (${file.size} bytes, ${file.mimetype})` : 'NO FILE'}`,
    );
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.voiceService.transcribe(file);
  }

  @Post('answer')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async answer(
    @UploadedFile() file: Express.Multer.File,
    @Body()
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
      `answer called - file: ${file ? `${file.originalname} (${file.size} bytes)` : 'NO FILE'}, body: ${JSON.stringify(body)}`,
    );
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.voiceService.answer(file, body);
  }
}
