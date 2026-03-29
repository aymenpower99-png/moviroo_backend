import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassengerEntity } from './entities/passengers.entity';
import { PassengersService } from './passengers.service';
import { PassengersController } from './passengers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PassengerEntity])],
  controllers: [PassengersController],
  providers: [PassengersService],
  exports: [PassengersService],
})
export class PassengersModule {}