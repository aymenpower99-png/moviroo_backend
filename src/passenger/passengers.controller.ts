import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PassengersService } from './passengers.service';
import {
  UpdatePassengerDto,
  UpdateNotificationsDto,
} from './dto/passenger.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entites/user.entity';

@Controller('passengers')
@UseGuards(AuthGuard('jwt'))
export class PassengersController {
  constructor(private readonly passengersService: PassengersService) {}

  // ─── Profile ──────────────────────────────────────────────────────────────

  /** GET /passengers/me */
  @Get('me')
  getProfile(@CurrentUser() user: User) {
    return this.passengersService.getProfile(user.id);
  }

  /** PATCH /passengers/me */
  @Patch('me')
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdatePassengerDto) {
    return this.passengersService.updateProfile(user.id, dto);
  }

  /** GET /passengers/me/notifications */
  @Get('me/notifications')
  getNotifications(@CurrentUser() user: User) {
    return this.passengersService.getNotificationPreferences(user.id);
  }

  /** PATCH /passengers/me/notifications */
  @Patch('me/notifications')
  updateNotifications(
    @CurrentUser() user: User,
    @Body() dto: UpdateNotificationsDto,
  ) {
    return this.passengersService.updateNotificationPreferences(user.id, dto);
  }

  // ─── Referral ─────────────────────────────────────────────────────────────

  /** GET /passengers/me/referral */
  @Get('me/referral')
  getReferral(@CurrentUser() user: User) {
    return this.passengersService.getReferralCode(user.id);
  }

  // ─── Membership ───────────────────────────────────────────────────────────

  /** GET /passengers/me/membership */
  @Get('me/membership')
  getMembership(@CurrentUser() user: User) {
    return this.passengersService.getMembershipInfo(user.id);
  }

  /** POST /passengers/me/membership/:levelId/claim */
  @Post('me/membership/:levelId/claim')
  claimLevel(@CurrentUser() user: User, @Param('levelId') levelId: string) {
    return this.passengersService.claimLevelCoupon(user.id, levelId);
  }

  // ─── Coupons ──────────────────────────────────────────────────────────────

  /** GET /passengers/me/coupons */
  @Get('me/coupons')
  getCoupons(@CurrentUser() user: User) {
    return this.passengersService.getUserCoupons(user.id);
  }

  /** POST /passengers/me/coupons/apply — validate without marking used */
  @Post('me/coupons/apply')
  @HttpCode(HttpStatus.OK)
  applyCoupon(@CurrentUser() user: User, @Body('code') code: string) {
    return this.passengersService.validateCoupon(user.id, code);
  }

  /** PATCH /passengers/me/coupons/:code/use — mark coupon as used */
  @Patch('me/coupons/:code/use')
  useCoupon(@CurrentUser() user: User, @Param('code') code: string) {
    return this.passengersService.useCoupon(user.id, code);
  }
}
