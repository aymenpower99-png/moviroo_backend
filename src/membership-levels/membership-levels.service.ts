import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MembershipLevelEntity } from './entities/membership-level.entity';
import { CreateMembershipLevelDto } from './dto/create-membership-level.dto';
import { UpdateMembershipLevelDto } from './dto/update-membership-level.dto';

@Injectable()
export class MembershipLevelsService {
  constructor(
    @InjectRepository(MembershipLevelEntity)
    private readonly repo: Repository<MembershipLevelEntity>,
  ) {}

  // ── Create ──────────────────────────────────────────────────────────────────

  async create(dto: CreateMembershipLevelDto): Promise<MembershipLevelEntity> {
    const existing = await this.repo.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(
        `A membership level named "${dto.name}" already exists.`,
      );
    }
    const level = this.repo.create(dto);
    return this.repo.save(level);
  }

  // ── Find All (ordered by `order` ASC) ───────────────────────────────────────

  async findAll(): Promise<MembershipLevelEntity[]> {
    return this.repo.find({ order: { order: 'ASC', createdAt: 'ASC' } });
  }

  // ── Find All Active (used by eligibility engine) ────────────────────────────

  async findAllActive(): Promise<MembershipLevelEntity[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { order: 'ASC' },
    });
  }

  // ── Find One ─────────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<MembershipLevelEntity> {
    const level = await this.repo.findOne({ where: { id } });
    if (!level) {
      throw new NotFoundException(`Membership level "${id}" not found.`);
    }
    return level;
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateMembershipLevelDto,
  ): Promise<MembershipLevelEntity> {
    const level = await this.findOne(id);

    // Guard against name collision when renaming
    if (dto.name && dto.name !== level.name) {
      const duplicate = await this.repo.findOne({ where: { name: dto.name } });
      if (duplicate) {
        throw new ConflictException(
          `A membership level named "${dto.name}" already exists.`,
        );
      }
    }

    Object.assign(level, dto);
    return this.repo.save(level);
  }

  // ── Toggle Active / Inactive ────────────────────────────────────────────────

  async toggleActive(
    id: string,
  ): Promise<{ id: string; isActive: boolean; message: string }> {
    const level = await this.findOne(id);
    level.isActive = !level.isActive;
    await this.repo.save(level);
    return {
      id: level.id,
      isActive: level.isActive,
      message: `Membership level "${level.name}" is now ${level.isActive ? 'active' : 'inactive'}.`,
    };
  }

  // ── Eligibility: resolve highest level a user qualifies for ─────────────────

  async resolveEligibleLevel(
    points: number,
  ): Promise<MembershipLevelEntity | null> {
    const activeLevels = await this.findAllActive();
    // Levels are sorted ASC by order — pick the highest tier the user qualifies for
    const eligible = activeLevels.filter((l) => points >= l.requiredPoints);
    return eligible.length > 0 ? eligible[eligible.length - 1] : null;
  }

  // ── Claim: assign a specific level if user meets requirements ───────────────

  async claimLevel(
    levelId: string,
    userPoints: number,
  ): Promise<MembershipLevelEntity> {
    const level = await this.findOne(levelId);
    if (!level.isActive) {
      throw new BadRequestException('This membership level is not active.');
    }
    if (userPoints < level.requiredPoints) {
      throw new BadRequestException(
        `Not enough points. Required: ${level.requiredPoints}, current: ${userPoints}.`,
      );
    }
    return level;
  }
}
