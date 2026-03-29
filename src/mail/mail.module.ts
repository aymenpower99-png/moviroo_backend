import { Module, Global } from '@nestjs/common';
import { MailService } from './mail.service';

@Global() // ← inject MailService anywhere without re-importing
@Module({
  providers: [MailService],
  exports:   [MailService],
})
export class MailModule {}