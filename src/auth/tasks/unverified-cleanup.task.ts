import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { User } from '../../users/entites/user.entity';

@Injectable()
export class UnverifiedCleanupTask {
  private readonly logger = new Logger(UnverifiedCleanupTask.name);

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  // Runs every day at 3:00 AM
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const result = await this.userRepo.delete({
      emailVerified: false,
      createdAt: LessThan(cutoff),
    });

    if (result.affected && result.affected > 0) {
      this.logger.log(
        `Cleaned up ${result.affected} unverified account(s) older than 7 days.`,
      );
    }
  }
}
