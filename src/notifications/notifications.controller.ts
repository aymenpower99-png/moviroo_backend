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

  /** POST /notifications/test-push - Send test push to current user */
  @Post('test-push')
  @HttpCode(HttpStatus.OK)
  async testPush(@CurrentUser() user: User) {
    const sent = await this.passengerNotificationService.rideStatusChanged(
      user.id,
      'test-ride-id',
      'EN_ROUTE_TO_PICKUP' as any,
    );
    return {
      message: sent ? 'Test push sent successfully' : 'Test push failed',
      sent,
    };
  }
}
