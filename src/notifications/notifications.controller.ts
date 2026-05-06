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

class TestNotificationDto {
  passengerId: string;
  rideId: string;
  driverName?: string;
}

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

  /** POST /notifications/test-driver-assigned - Test endpoint for debugging */
  @Post('test-driver-assigned')
  @HttpCode(HttpStatus.OK)
  async testDriverAssigned(@Body() dto: any) {
    console.log('🔔 Test notification request received:', dto);
    const result = await this.passengerNotificationService.driverAssigned(
      dto.passengerId,
      dto.rideId,
      dto.driverName || 'Test Driver',
    );
    console.log('🔔 Test notification result:', result);
    return { message: 'Test notification sent', result };
  }
}
