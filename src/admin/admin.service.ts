import { Injectable } from '@nestjs/common';
import { AdminInviteService } from './services/admin-invite.service';
import { AdminUsersService }  from './services/admin-users.service';
import { InviteUserDto }      from './dto/invite-user.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { UpdateUserDto }      from './dto/update-user.dto';
import { UserRole, UserStatus } from '../users/entites/user.entity';

@Injectable()
export class AdminService {
  constructor(
    private inviteService: AdminInviteService,
    private usersService:  AdminUsersService,
  ) {}

  inviteUser(dto: InviteUserDto)           { return this.inviteService.inviteUser(dto); }
  activateAccount(dto: ActivateAccountDto) { return this.inviteService.activateAccount(dto); }
  resendInvitation(userId: string)         { return this.inviteService.resendInvitation(userId); }

  listUsers(page: number, limit: number, role?: UserRole, status?: UserStatus) {
    return this.usersService.listUsers(page, limit, role, status);
  }
  getUser(userId: string)                         { return this.usersService.getUser(userId); }
  updateUser(userId: string, dto: UpdateUserDto)  { return this.usersService.updateUser(userId, dto); }
  blockUser(userId: string)                       { return this.usersService.blockUser(userId); }
  unblockUser(userId: string)                     { return this.usersService.unblockUser(userId); }
  deleteUser(userId: string)                      { return this.usersService.deleteUser(userId); }
}