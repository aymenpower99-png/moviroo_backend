import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {
  User,
  UserProvider,
  UserStatus,
  UserRole,
} from '../../users/entites/user.entity';
import {
  Driver,
  DriverAvailabilityStatus,
} from '../../driver/entities/driver.entity';
import {
  PassengerEntity,
  MembershipLevel,
} from '../../passenger/entities/passengers.entity';
import { RegisterDto } from '../dto/register.dto';
import { AuthMailService } from '../../mail/services/auth-mail.service';
import { WelcomeMailService } from '../../mail/services/welcome-mail.service';
import { AuthTokenService } from './auth-token.service';

@Injectable()
export class AuthRegisterService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(PassengerEntity)
    private readonly passengerRepo: Repository<PassengerEntity>,
    @InjectRepository(Driver) private readonly driverRepo: Repository<Driver>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly authMail: AuthMailService,
    private readonly welcomeMail: WelcomeMailService,
    private readonly tokenService: AuthTokenService,
  ) {}

  async register(dto: RegisterDto) {
    const emailExists = await this.userRepo.findOne({
      where: { email: dto.email },
    });

    if (emailExists) {
      if (emailExists.provider === UserProvider.GOOGLE) {
        throw new ConflictException(
          'This email is already registered using Google. Please log in with Google.',
        );
      }

      if (
        emailExists.provider === UserProvider.MANUAL &&
        !emailExists.emailVerified
      ) {
        const hashed = await bcrypt.hash(dto.password, 12);
        await this.userRepo.update(emailExists.id, {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          password: hashed,
        });

        const verifyToken = await this.jwtService.signAsync(
          { sub: emailExists.id, purpose: 'verify-email' },
          {
            secret: this.config.get<string>('jwt.accessSecret')!,
            expiresIn: '30m',
          },
        );

        await this.authMail.sendVerifyEmailLink(
          emailExists.email,
          dto.firstName,
          verifyToken,
        );

        return {
          message: 'A verification link has been resent to your email.',
          requiresVerification: true,
          userId: emailExists.id,
        };
      }

      throw new ConflictException('Email already in use');
    }

    const phoneExists = await this.userRepo.findOne({
      where: { phone: dto.phone },
    });
    if (phoneExists && phoneExists.emailVerified) {
      throw new ConflictException('Phone number already in use');
    }
    if (phoneExists && !phoneExists.emailVerified) {
      await this.userRepo.update(phoneExists.id, { phone: null });
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = this.userRepo.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      password: hashed,
      status: UserStatus.PENDING,
    });
    await this.userRepo.save(user);

    const verifyToken = await this.jwtService.signAsync(
      { sub: user.id, purpose: 'verify-email' },
      {
        secret: this.config.get<string>('jwt.accessSecret')!,
        expiresIn: '30m',
      },
    );

    await this.authMail.sendVerifyEmailLink(
      user.email,
      user.firstName,
      verifyToken,
    );

    return {
      message:
        'Registration successful. Check your email for a verification link.',
      requiresVerification: true,
      userId: user.id,
    };
  }

  async verifyEmailByToken(token: string) {
    let payload: { sub: string; purpose: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>('jwt.accessSecret')!,
      });
    } catch {
      throw new UnauthorizedException(
        'This verification link is invalid or has expired. Please register again.',
      );
    }

    if (payload.purpose !== 'verify-email') {
      throw new UnauthorizedException('Invalid verification token.');
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (user.emailVerified) {
      return { message: 'Email already verified.' };
    }

    await this.userRepo.update(user.id, {
      emailVerified: true,
      status: UserStatus.ACTIVE,
    });

    if (user.role === UserRole.PASSENGER) {
      const exists = await this.passengerRepo.findOne({
        where: { userId: user.id },
      });
      if (!exists) {
        await this.passengerRepo.save(
          this.passengerRepo.create({
            userId: user.id,
            preferredClassId: null,
            membershipLevel: MembershipLevel.GO,
            membershipPoints: 0,
            totalBookings: 0,
            ratingAverage: 5.0,
            totalRatings: 0,
            newsletterOptIn: false,
          }),
        );
      }
    } else if (user.role === UserRole.DRIVER) {
      const exists = await this.driverRepo.findOne({
        where: { userId: user.id },
      });
      if (!exists) {
        await this.driverRepo.save(
          this.driverRepo.create({
            userId: user.id,
            availabilityStatus: DriverAvailabilityStatus.OFFLINE,
            ratingAverage: 5.0,
            totalRatings: 0,
            totalTrips: 0,
          }),
        );
      }
    }

    this.welcomeMail.sendWelcome(user.role, user.email, user.firstName);

    const tokens = await this.tokenService.generateTokens(user);
    await this.tokenService.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      message: 'Email verified successfully.',
      ...tokens,
      user: this.tokenService.safeUser(user),
    };
  }

  async resendVerification(email: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('User not found');

    if (user.emailVerified) {
      throw new ConflictException('Email already verified. Please log in.');
    }

    const verifyToken = await this.jwtService.signAsync(
      { sub: user.id, purpose: 'verify-email' },
      {
        secret: this.config.get<string>('jwt.accessSecret')!,
        expiresIn: '30m',
      },
    );

    await this.authMail.sendVerifyEmailLink(
      user.email,
      user.firstName,
      verifyToken,
    );

    return { message: 'A new verification link has been sent to your email.' };
  }
}
