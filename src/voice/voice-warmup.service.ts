import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VoiceService } from '../voice/voice.service';

@Injectable()
export class VoiceWarmupService {
  private readonly logger = new Logger(VoiceWarmupService.name);

  constructor(private readonly voiceService: VoiceService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async warmUpVoiceEngine() {
    this.logger.log('Warming up voice engine...');
    const status = await this.voiceService.healthCheck();
    if (status) {
      this.logger.log(`Voice engine warm: ${status.model}`);
    } else {
      this.logger.warn('Voice engine cold or unreachable');
    }
  }
}
