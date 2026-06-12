import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ScheduleModule } from '@nestjs/schedule';
import multer from 'multer';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { VoiceWarmupService } from './voice-warmup.service';

@Module({
  imports: [
    MulterModule.register({
      storage: multer.memoryStorage(), // keep file in memory so file.buffer is available
    }),
    ScheduleModule.forRoot(),
  ],
  controllers: [VoiceController],
  providers: [VoiceService, VoiceWarmupService],
  exports: [VoiceService],
})
export class VoiceModule {}
