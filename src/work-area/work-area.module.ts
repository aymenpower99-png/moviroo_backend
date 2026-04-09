import { Module }        from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkArea }      from './entities/work-area.entity';
import { Driver }        from '../driver/entities/driver.entity';
import { Vehicle }       from '../vehicles/entities/vehicle.entity';
import { WorkAreaService }    from './work-area.service';
import { WorkAreaController } from './work-area.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WorkArea, Driver, Vehicle])],
  controllers: [WorkAreaController],
  providers:   [WorkAreaService],
  exports:     [WorkAreaService],
})
export class WorkAreaModule {}