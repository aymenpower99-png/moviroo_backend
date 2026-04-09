import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../../users/entites/user.entity';
import { Driver } from '../../driver/entities/driver.entity';
import { UpdateUserDto } from '../dto/update-user.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Driver) private driverRepo: Repository<Driver>,
  ) {}

  // ─── List Users ───────────────────────────────────────────────────────────────

  async listUsers(page = 1, limit = 20, role?: UserRole, status?: UserStatus) {
    const where: Partial<{ role: UserRole; status: UserStatus }> = {};
    if (role) where.role = role;
    if (status) where.status = status;

    const [data, total] = await this.userRepo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const driverUserIds = data
      .filter((u) => u.role === UserRole.DRIVER)
      .map((u) => u.id);

    const driverProfiles = driverUserIds.length
      ? await this.driverRepo
          .createQueryBuilder('d')
          .select(['d.id', 'd.userId', 'd.availabilityStatus'])
          .where('d.userId IN (:...ids)', { ids: driverUserIds })
          .getMany()
      : [];

    const driverByUserId = new Map(driverProfiles.map((d) => [d.userId, d]));

    return {
      data: data.map((u) => ({
        ...this.safeUser(u),
        ...(u.role === UserRole.DRIVER
          ? {
              profileComplete: driverByUserId.has(u.id),
              driverStatus:
                driverByUserId.get(u.id)?.availabilityStatus ?? null,
            }
          : {}),
      })),
      total,
      page,
      limit,
    };
  }

  // ─── Get Single User ────────────────────────────────────��─────────────────────

  async getUser(userId: string) {
    const user = await this.findUserOrFail(userId);
    return this.safeUser(user);
  }

  // ─── Update User ──────────────────────────────────────────────────────────────

  async updateUser(userId: string, dto: UpdateUserDto) {
    const user = await this.findUserOrFail(userId);

    if (dto.email && dto.email !== user.email) {
      const exists = await this.userRepo.findOne({
        where: { email: dto.email },
      });
      if (exists) throw new BadRequestException('Email is already in use.');
    }

    await this.userRepo.update(userId, {
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.role !== undefined && { role: dto.role }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
    });

    const updated = await this.userRepo.findOneOrFail({
      where: { id: userId },
    });
    return this.safeUser(updated);
  }

  // ─── Block / Unblock ──────────────────────────────────────────────────────────

  async blockUser(userId: string) {
    const user = await this.findUserOrFail(userId);
    if (user.status === UserStatus.BLOCKED)
      throw new BadRequestException('User is already blocked.');
    await this.userRepo.update(userId, { status: UserStatus.BLOCKED });
    return { message: 'User has been blocked.' };
  }

  async unblockUser(userId: string) {
    const user = await this.findUserOrFail(userId);
    if (user.status !== UserStatus.BLOCKED)
      throw new BadRequestException('User is not blocked.');
    await this.userRepo.update(userId, { status: UserStatus.ACTIVE });
    return { message: 'User has been unblocked.' };
  }

  // ─── Delete User ──────────────────────────────────────────────────────────────

  async deleteUser(userId: string) {
    const user = await this.findUserOrFail(userId);

    if (user.role === UserRole.DRIVER) {
      const driverProfile = await this.driverRepo.findOne({
        where: { userId: user.id },
      });
      if (driverProfile) {
        await this.driverRepo.delete(driverProfile.id);
      }
    }

    await this.userRepo.delete(user.id);
    return { message: 'User has been deleted.' };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  async findUserOrFail(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  safeUser(user: User) {
    const {
      password,
      refreshToken,
      otpCode,
      totpSecret,
      inviteToken,
      ...safe
    } = user;
    return safe;
  }
}
