import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { LibreTranslateService } from './services/libre-translate.service';
import { Driver } from '../driver/entities/driver.entity';
import { PassengerEntity } from '../passenger/entities/passengers.entity';
import { Ride } from '../rides/domain/entities/ride.entity';
import { User } from '../users/entites/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatMessage,
      Driver,
      PassengerEntity,
      Ride,
      User,
    ]),
    NotificationsModule,
  ],
  controllers: [ChatController],
  providers: [ChatGateway, LibreTranslateService],
  exports: [ChatGateway],
})
export class ChatModule {}
