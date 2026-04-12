import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService }    from './app.service';

import appConfig      from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig      from './config/jwt.config';
import mailConfig     from './config/mail.config';

import { DatabaseModule }  from './database/database.module';
import { AuthModule }      from './auth/auth.module';
import { MailModule }      from './mail/mail.module';
import { AdminModule }     from './admin/admin.module';
import { ClassesModule }   from './classes/classes.module';      // ← ADD
import { VehiclesModule }  from './vehicles/vehicles.module';
import { DriversModule }   from './driver/drivers.module';
import { SupportModule }   from './support/support.module';
import { WorkAreaModule }  from './work-area/work-area.module';
import { RidesModule }     from './rides/rides.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, mailConfig],
    }),
    DatabaseModule,
    MailModule,
    AuthModule,
    AdminModule,
    ClassesModule,       // ← ADD
    VehiclesModule,
    DriversModule,
    SupportModule,
    WorkAreaModule,
    RidesModule,
  ],
  controllers: [AppController],
  providers:   [AppService],
})
export class AppModule {}