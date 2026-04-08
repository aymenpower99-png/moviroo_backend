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
import { User, UserRole, UserStatus } from '../../users/entites/user.entity';
import { Driver, DriverAvailabilityStatus } from '../../driver/entities/driver.entity';
import { PassengerEntity, MembershipLevel } from '../../passenger/entities/passengers.entity';
import { VehicleType } from '../../vehicles/entities/vehicle.entity';
import { MailService } from '../../mail/mail.service';
import { InviteUserDto } from '../dto/invite-user.dto';
import { ActivateAccountDto } from '../dto/activate-account.dto';

interface InviteTokenPayload {
  sub: string;
  email: string;
  purpose: 'invite';
}

@Injectable()
export class AdminInviteService {
  constructor(
    @InjectRepository(User)            private userRepo: Repository<User>,
    @InjectRepository(Driver)          private driverRepo: Repository<Driver>,
    @InjectRepository(PassengerEntity) private passengerRepo: Repository<PassengerEntity>,
    private jwtService: JwtService,
    private config: ConfigService,
    private mailService: MailService,
  ) {}

  // ─── Invite User ─────────────────────────────────────────────────────────────

  async inviteUser(dto: InviteUserDto) {
    const exists = await this.userRepo.findOne({
      where: { email: dto.email },
      withDeleted: true,
    });

    if (exists) {
      if (exists.deletedAt) {
        await this.userRepo.restore(exists.id);
        await this.userRepo.update(exists.id, {
          firstName:     dto.firstName,
          lastName:      dto.lastName,
          role:          dto.role,
          status:        UserStatus.PENDING,
          password:      null,
          emailVerified: false,
          inviteToken:   null,
        });

        const restoredUser = await this.userRepo.findOneOrFail({ where: { id: exists.id } });
        const { token, link } = await this.generateInviteLink(restoredUser);
        const hashed = await bcrypt.hash(token, 10);
        await this.userRepo.update(restoredUser.id, { inviteToken: hashed });
        await this.mailService.sendInvitation(restoredUser.email, restoredUser.firstName, link);

        // Pre-create driver row so it shows as PENDING in driver page
        if (restoredUser.role === UserRole.DRIVER) {
          await this.ensureDriverPending(restoredUser.id);
        }

        return { message: `Invitation sent to ${restoredUser.email}.`, userId: restoredUser.id };
      }
      throw new BadRequestException('A user with this email already exists.');
    }

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

    // Pre-create driver row so it shows as PENDING in driver page
    if (user.role === UserRole.DRIVER) {
      await this.ensureDriverPending(user.id);
    }

    return { message: `Invitation sent to ${user.email}.`, userId: user.id };
  }

  // ─── Activate Account ────────────────────────────────────────────────────────

  async activateAccount(dto: ActivateAccountDto) {
    let payload: InviteTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<InviteTokenPayload>(
        dto.token,
        { secret: this.config.get<string>('jwt.inviteSecret')! },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired activation link.');
    }

    if (payload.purpose !== 'invite')
      throw new UnauthorizedException('Invalid token type.');

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) throw new NotFoundException('User not found.');

    if (user.status === UserStatus.ACTIVE)
      throw new BadRequestException('Account is already active.');
    if (user.status === UserStatus.BLOCKED)
      throw new BadRequestException('Account is blocked. Contact support.');
    if (!user.inviteToken)
      throw new UnauthorizedException('Activation link has already been used or is invalid.');

    const tokenValid = await bcrypt.compare(dto.token, user.inviteToken);
    if (!tokenValid)
      throw new UnauthorizedException('Activation link has expired. Request a new one.');

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    await this.userRepo.update(user.id, {
      password:      hashedPassword,
      status:        UserStatus.ACTIVE,
      emailVerified: true,
      inviteToken:   null,
    });

    // Auto-create passenger profile
    if (user.role === UserRole.PASSENGER) {
      const exists = await this.passengerRepo.findOne({ where: { userId: user.id } });
      if (!exists) {
        await this.passengerRepo.save(
          this.passengerRepo.create({
            userId:               user.id,
            preferredVehicleType: VehicleType.STANDARD,
            membershipLevel:      MembershipLevel.GO,
            membershipPoints:     0,
            totalBookings:        0,
            ratingAverage:        5.0,
            totalRatings:         0,
            newsletterOptIn:      false,
          }),
        );
      }
    }

    // Transition driver: PENDING → SETUP_REQUIRED
    if (user.role === UserRole.DRIVER) {
      await this.driverRepo.update(
        { userId: user.id, availabilityStatus: DriverAvailabilityStatus.PENDING },
        { availabilityStatus: DriverAvailabilityStatus.SETUP_REQUIRED },
      );
    }

    return { message: 'Account activated successfully. You can now log in.' };
  }

  // ─── Resend Invitation ────────────────────────────────────────────────────────

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

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async ensureDriverPending(userId: string): Promise<void> {
    const existing = await this.driverRepo.findOne({ where: { userId } });
    if (!existing) {
      await this.driverRepo.save(
        this.driverRepo.create({
          userId,
          availabilityStatus: DriverAvailabilityStatus.PENDING,
        }),
      );
    }
  }

  async findUserOrFail(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  private async generateInviteLink(user: User) {
    const token = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, purpose: 'invite' } satisfies InviteTokenPayload,
      { secret: this.config.get<string>('jwt.inviteSecret')!, expiresIn: '72h' },
    );
    const backendUrl = (
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/api\/?$/, '');
    const link = `${backendUrl}/api/admin/users/activate?token=${token}`;
    return { token, link };
  }
}