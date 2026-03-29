import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PassengerEntity } from '../../passenger/entities/passengers.entity';

@Injectable()
export class PassengerGuard implements CanActivate {
  constructor(
    @InjectRepository(PassengerEntity)
    private readonly passengerRepo: Repository<PassengerEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId  = request.user?.sub ?? request.user?.id;

    const passenger = await this.passengerRepo.findOne({ where: { userId } });
    if (!passenger) {
      throw new ForbiddenException('Only passengers can access this feature');
    }

    return true;
  }
}