import { Module }        from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkArea }      from './entities/work-area.entity';
import { Driver }        from '../driver/entities/driver.entity';
import { Vehicle }       from '../vehicles/entities/vehicle.entity';
import { User }          from '../users/entites/user.entity';
import { WorkAreaService }    from './work-area.service';
import { WorkAreaController } from './work-area.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WorkArea, Driver, Vehicle, User])],
  controllers: [WorkAreaController],
  providers:   [WorkAreaService],
  exports:     [WorkAreaService],
})
export class WorkAreaModule {}