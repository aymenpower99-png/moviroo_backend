import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entites/user.entity';
import { Driver } from '../driver/entities/driver.entity';
import { FcmService } from './fcm.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Driver])],
  providers: [FcmService],
  exports: [FcmService],
})
export class NotificationsModule {}
