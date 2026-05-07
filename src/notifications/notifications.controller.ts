import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FcmService } from './services/fcm.service';
import { PassengerNotificationService } from './services/passenger-notification.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entites/user.entity';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(
    private readonly fcmService: FcmService,
    private readonly passengerNotificationService: PassengerNotificationService,
  ) {}

  /** POST /notifications/fcm-token */
  @Post('fcm-token')
  @HttpCode(HttpStatus.OK)
  async registerFcmToken(
    @CurrentUser() user: User,
    @Body('token') token: string,
  ) {
    if (!token) {
      return { message: 'Token is required' };
    }
    await this.fcmService.registerToken(user.id, token);
    return { message: 'FCM token registered successfully' };
  }
}
