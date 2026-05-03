import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipLevelEntity } from './entities/membership-level.entity';
import { MembershipLevelsController } from './membership-levels.controller';
import { MembershipLevelsService } from './membership-levels.service';

@Module({
  imports: [TypeOrmModule.forFeature([MembershipLevelEntity])],
  controllers: [MembershipLevelsController],
  providers: [MembershipLevelsService],
  exports: [MembershipLevelsService],
})
export class MembershipLevelsModule {}
