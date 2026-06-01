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
import { DriverNotificationService } from './services/driver-notification.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entites/user.entity';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(
    private readonly fcmService: FcmService,
    private readonly passengerNotificationService: PassengerNotificationService,
    private readonly driverNotificationService: DriverNotificationService,
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

  /** POST /notifications/test-driver-push - Send test push to current driver user */
  @Post('test-driver-push')
  @HttpCode(HttpStatus.OK)
  async testDriverPush(@CurrentUser() user: User) {
    const sent = await this.driverNotificationService.rideStatusChanged(
      user.id,
      'test-ride-id',
      'EN_ROUTE_TO_PICKUP' as any,
    );
    return {
      message: sent
        ? 'Test driver push sent successfully'
        : 'Test driver push failed',
      sent,
    };
  }

  /** POST /notifications/test-token-push - Send test push directly to an FCM token */
  @Post('test-token-push')
  @HttpCode(HttpStatus.OK)
  async testTokenPush(
    @Body('token') token: string,
    @Body('title') title: string = 'Test Notification',
    @Body('body')
    body: string = 'This is a test notification from Moviroo Driver',
  ) {
    if (!token) {
      return { message: 'FCM token is required', sent: false };
    }
    const sent = await this.fcmService.sendToToken(token, title, body, {
      type: 'TEST_NOTIFICATION',
      channelId: 'ride_updates',
    });
    return {
      message: sent ? 'Test push sent successfully' : 'Test push failed',
      sent,
    };
  }
}
