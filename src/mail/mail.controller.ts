import { Controller, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Controller('mail')
@UseGuards(AuthGuard('jwt'))
export class MailController {
  // Mail functionality handled by individual mail services
  // No public endpoints needed - emails are sent internally
}
