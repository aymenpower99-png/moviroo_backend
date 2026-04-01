import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import * as bcrypt from 'bcrypt';
import { User } from '../../users/entites/user.entity';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // reads Authorization: Bearer <token>
      secretOrKey: config.get<string>('jwt.refreshSecret') ?? 'fallback-refresh-secret',
      passReqToCallback: true as true,
    });
  }

  async validate(req: Request, payload: { sub: string }) {
    const incomingToken = req.headers.authorization?.split(' ')[1];
    if (!incomingToken) throw new UnauthorizedException('No token provided');

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    const isMatch = await bcrypt.compare(incomingToken, user.refreshToken);
    if (!isMatch) {
      // Token reuse detected → revoke immediately (rotation security)
      await this.userRepo.update(user.id, { refreshToken: null });
      throw new UnauthorizedException('Token reuse detected — please login again');
    }

    return user;
  }
}