import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AdminController }    from './admin.controller';
import { AdminService }       from './admin.service';
import { AdminInviteService } from './services/admin-invite.service';
import { AdminUsersService }  from './services/admin-users.service';
import { User }               from '../users/entites/user.entity';
import { Driver }             from '../driver/entities/driver.entity';
import { PassengerEntity }    from '../passenger/entities/passengers.entity';
import { MailModule }         from '../mail/mail.module';
import { HtmlService }        from '../common/services/html.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Driver, PassengerEntity]),
    JwtModule.register({}),
    MailModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminInviteService,
    AdminUsersService,
    HtmlService,
  ],
})
export class AdminModule {}