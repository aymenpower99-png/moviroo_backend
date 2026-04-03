import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { User } from '../users/entites/user.entity';
import { MailModule } from '../mail/mail.module';
import { HtmlService } from '../common/services/html.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({}),
    MailModule,

  ],
  controllers: [AdminController],
  providers:   [AdminService, HtmlService],
})
export class AdminModule {}