import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import mailConfig from './config/mail.config';          // ← ADD
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';        // ← ADD

@Module({
  imports: [
    
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig, mailConfig],   // ← ADD mailConfig
    }),
    DatabaseModule,
    MailModule,                                         // ← ADD
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}