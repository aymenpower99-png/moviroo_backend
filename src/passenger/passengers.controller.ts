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
import { UpdatePassengerDto, AddPaymentAddressDto } from './dto/passenger.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('passengers')
@UseGuards(AuthGuard('jwt'))
export class PassengersController {
  constructor(private readonly passengersService: PassengersService) {}

  // ─── Profile ──────────────────────────────────────────────────────────────

  /** GET /passengers/me */
  @Get('me')
  getProfile(@CurrentUser() user: { sub: string }) {
    return this.passengersService.getProfile(user.sub);
  }

  /** PATCH /passengers/me */
  @Patch('me')
  updateProfile(
    @CurrentUser() user: { sub: string },
    @Body() dto: UpdatePassengerDto,
  ) {
    return this.passengersService.updateProfile(user.sub, dto);
  }

  // ─── Payment Addresses ────────────────────────────────────────────────────

  /** GET /passengers/me/addresses */
  @Get('me/addresses')
  getAddresses(@CurrentUser() user: { sub: string }) {
    return this.passengersService.getPaymentAddresses(user.sub);
  }

  /** POST /passengers/me/addresses */
  @Post('me/addresses')
  addAddress(
    @CurrentUser() user: { sub: string },
    @Body() dto: AddPaymentAddressDto,
  ) {
    return this.passengersService.addPaymentAddress(user.sub, dto.address);
  }

  /** DELETE /passengers/me/addresses/:label */
  @Delete('me/addresses/:label')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAddress(
    @CurrentUser() user: { sub: string },
    @Param('label') label: string,
  ) {
    return this.passengersService.removePaymentAddress(user.sub, label);
  }

  // ─── Referral ─────────────────────────────────────────────────────────────

  /** GET /passengers/me/referral */
  @Get('me/referral')
  getReferral(@CurrentUser() user: { sub: string }) {
    return this.passengersService.getReferralCode(user.sub);
  }

  // ─── Membership ───────────────────────────────────────────────────────────

  /** GET /passengers/me/membership */
  @Get('me/membership')
  getMembership(@CurrentUser() user: { sub: string }) {
    return this.passengersService.getMembershipInfo(user.sub);
  }
}