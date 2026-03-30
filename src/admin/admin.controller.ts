import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminService } from './admin.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole, UserStatus } from '../users/entites/user.entity';

@Controller('admin/users')
export class AdminController {
  constructor(private adminService: AdminService) {}

  // ─── Public: Activate Account ─────────────────────────────────────────────

  @Post('activate')
  @HttpCode(200)
  activateAccount(@Body() dto: ActivateAccountDto) {
    return this.adminService.activateAccount(dto);
  }

  // ─── Admin: Invite User ───────────────────────────────────────────────────

  @Post('invite')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  inviteUser(@Body() dto: InviteUserDto) {
    return this.adminService.inviteUser(dto);
  }

  // ─── Admin: List Users ────────────────────────────────────────────────────

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  listUsers(
    @Query('page')   page:   string  = '1',
    @Query('limit')  limit:  string  = '20',
    @Query('role')   role?:  UserRole,
    @Query('status') status?: UserStatus,
  ) {
    return this.adminService.listUsers(+page, +limit, role, status);
  }

  // ─── Admin: Get User ──────────────────────────────────────────────────────

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUser(id);
  }

  // ─── Admin: Update User ───────────────────────────────────���───────────────

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.adminService.updateUser(id, dto);
  }

  // ─── Admin: Block User ────────────────────────────────────────────────────

  @Post(':id/block')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(200)
  blockUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.blockUser(id);
  }

  // ─── Admin: Unblock User ──────────────────────────────────────────────────

  @Post(':id/unblock')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(200)
  unblockUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.unblockUser(id);
  }

  // ─── Admin: Resend Invite ─────────────────────────────────────────────────

  @Post(':id/resend-invite')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(200)
  resendInvitation(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.resendInvitation(id);
  }
}