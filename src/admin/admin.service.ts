import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from '../users/entites/user.entity';
import { MailService } from '../mail/mail.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { UpdateUserDto } from './dto/update-user.dto';

interface InviteTokenPayload {
  sub:     string;
  email:   string;
  purpose: 'invite';
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService:  JwtService,
    private config:      ConfigService,
    private mailService: MailService,
  ) {}

  // ─── Invite User ──────────────────────────────────────────────────────────

  async inviteUser(dto: InviteUserDto) {
    const exists = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('A user with this email already exists.');

    const user = this.userRepo.create({
      firstName: dto.firstName,
      lastName:  dto.lastName,
      email:     dto.email,
      role:      dto.role,
      status:    UserStatus.PENDING,
      password:  null,
    });
    await this.userRepo.save(user);

    const { token, link } = await this.generateInviteLink(user);
    const hashed = await bcrypt.hash(token, 10);
    await this.userRepo.update(user.id, { inviteToken: hashed });

    await this.mailService.sendInvitation(user.email, user.firstName, link);

    return {
      message: `Invitation sent to ${user.email}.`,
      userId:  user.id,
    };
  }

  // ─── Activate Account ─────────────────────────────────────────────────────

  async activateAccount(dto: ActivateAccountDto) {
    let payload: InviteTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<InviteTokenPayload>(dto.token, {
        secret: this.config.get<string>('jwt.inviteSecret')!,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired activation link.');
    }

    if (payload.purpose !== 'invite') throw new UnauthorizedException('Invalid token type.');

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) throw new NotFoundException('User not found.');

    if (user.status === UserStatus.ACTIVE)
      throw new BadRequestException('Account is already active.');

    if (user.status === UserStatus.BLOCKED)
      throw new BadRequestException('Account is blocked. Contact support.');

    if (!user.inviteToken)
      throw new UnauthorizedException('Activation link has already been used or is invalid.');

    const tokenValid = await bcrypt.compare(dto.token, user.inviteToken);
    if (!tokenValid) throw new UnauthorizedException('Activation link has expired. Request a new one.');

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    await this.userRepo.update(user.id, {
      password:      hashedPassword,
      status:        UserStatus.ACTIVE,
      emailVerified: true,
      inviteToken:   null,
    });

    return { message: 'Account activated successfully. You can now log in.' };
  }

  // ─── Resend Invitation ────────────────────────────────────────────────────

  async resendInvitation(userId: string) {
    const user = await this.findUserOrFail(userId);

    if (user.status !== UserStatus.PENDING)
      throw new BadRequestException('Can only resend invitation to pending users.');

    const { token, link } = await this.generateInviteLink(user);
    const hashed = await bcrypt.hash(token, 10);
    await this.userRepo.update(user.id, { inviteToken: hashed });

    await this.mailService.sendInvitation(user.email, user.firstName, link);
    return { message: `Invitation resent to ${user.email}.` };
  }

  // ─── List Users ───────────────────────────────────────────────────────────

  async listUsers(
    page:    number     = 1,
    limit:   number     = 20,
    role?:   UserRole,
    status?: UserStatus,
  ) {
    const where: Partial<{ role: UserRole; status: UserStatus }> = {};
    if (role)   where.role   = role;
    if (status) where.status = status;

    const [data, total] = await this.userRepo.findAndCount({
      where,
      skip:  (page - 1) * limit,
      take:  limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data:  data.map(u => this.safeUser(u)),
      total,
      page,
      limit,
    };
  }

  // ─── Get Single User ──────────────────────────────────────────────────────

  async getUser(userId: string) {
    const user = await this.findUserOrFail(userId);
    return this.safeUser(user);
  }

  // ─── Update User ──────────────────────────────────────────────────────────

  async updateUser(userId: string, dto: UpdateUserDto) {
    const user = await this.findUserOrFail(userId);

    if (dto.email && dto.email !== user.email) {
      const exists = await this.userRepo.findOne({ where: { email: dto.email } });
      if (exists) throw new BadRequestException('Email is already in use.');
    }

    await this.userRepo.update(userId, {
      ...(dto.firstName && { firstName: dto.firstName }),
      ...(dto.lastName  && { lastName:  dto.lastName }),
      ...(dto.email     && { email:     dto.email }),
      ...(dto.role      && { role:      dto.role }),
    });

    const updated = await this.userRepo.findOneOrFail({ where: { id: userId } });
    return this.safeUser(updated);
  }

  // ─── Block User ───────────────────────────────────────────────────────────

  async blockUser(userId: string) {
    const user = await this.findUserOrFail(userId);

    if (user.status === UserStatus.BLOCKED)
      throw new BadRequestException('User is already blocked.');

    await this.userRepo.update(userId, { status: UserStatus.BLOCKED });
    return { message: 'User has been blocked.' };
  }

  // ─── Unblock User ─────────────────────────────────────────────────────────

  async unblockUser(userId: string) {
    const user = await this.findUserOrFail(userId);

    if (user.status !== UserStatus.BLOCKED)
      throw new BadRequestException('User is not blocked.');

    await this.userRepo.update(userId, { status: UserStatus.ACTIVE });
    return { message: 'User has been unblocked.' };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async findUserOrFail(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  private async generateInviteLink(user: User) {
    const token = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, purpose: 'invite' } satisfies InviteTokenPayload,
      {
        secret:    this.config.get<string>('jwt.inviteSecret')!,
        expiresIn: '72h',
      },
    );
    // Points to the backend GET route that serves the HTML activation form
    const backendUrl = this.config.get<string>('BACKEND_URL') ?? 'http://localhost:3000';
    const link = `${backendUrl}/api/admin/users/activate?token=${token}`;
    return { token, link };
  }

  private safeUser(user: User) {
    const { password, refreshToken, otpCode, totpSecret, inviteToken, ...safe } = user;
    return safe;
  }
}