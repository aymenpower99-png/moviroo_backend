import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  User,
  UserProvider,
  UserStatus,
  UserRole,
} from '../../users/entites/user.entity';
import {
  PassengerEntity,
  MembershipLevel,
} from '../../passenger/entities/passengers.entity';
import { GoogleSignInDto } from '../dto/google-signin.dto';
import { WelcomeMailService } from '../../mail/services/welcome-mail.service';
import { AuthTokenService } from './auth-token.service';
import { AuthSessionService } from './auth-session.service';

@Injectable()
export class AuthOAuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(PassengerEntity)
    private readonly passengerRepo: Repository<PassengerEntity>,
    private readonly welcomeMail: WelcomeMailService,
    private readonly tokenService: AuthTokenService,
    private readonly sessionService: AuthSessionService,
  ) {}

  async googleSignIn(
    dto: GoogleSignInDto,
    deviceLabel?: string,
    ipAddress?: string,
    deviceId?: string,
    platform?: string,
    userAgent?: string,
  ) {
    const payload = this.tokenService.parseJwt(dto.idToken);
    const email = payload.email as string;
    const firstName = (payload.given_name as string) || '';
    const lastName = (payload.family_name as string) || '';

    let user = await this.userRepo.findOne({ where: { email } });

    if (user) {
      if (user.provider === UserProvider.MANUAL) {
        throw new ConflictException(
          'This email is already registered with email and password. Please log in with your email and password.',
        );
      }

      if (user.status === UserStatus.BLOCKED) {
        throw new ForbiddenException(
          'Your account has been blocked. Please contact support.',
        );
      }
    } else {
      // Check if a soft-deleted user exists with this email (admin deleted)
      const deletedUser = await this.userRepo.findOne({
        where: { email },
        withDeleted: true,
      });

      if (deletedUser) {
        // Restore the soft-deleted user and update their info
        await this.userRepo.restore(deletedUser.id);
        user = deletedUser;
        user.provider = UserProvider.GOOGLE;
        user.emailVerified = true;
        user.status = UserStatus.ACTIVE;
        user.firstName = firstName;
        user.lastName = lastName;
        await this.userRepo.save(user);

        // Ensure passenger profile exists (may also be soft-deleted)
        const passenger = await this.passengerRepo.findOne({
          where: { userId: user.id },
          withDeleted: true,
        });
        if (passenger) {
          await this.passengerRepo.restore(passenger.id);
        } else {
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
      } else {
        // Create brand-new user
        user = this.userRepo.create({
          email,
          firstName,
          lastName,
          provider: UserProvider.GOOGLE,
          emailVerified: true,
          status: UserStatus.ACTIVE,
          role: UserRole.PASSENGER,
        });
        await this.userRepo.save(user);

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
    }

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    const tokens = await this.tokenService.generateTokens(user);
    await this.tokenService.saveRefreshToken(user.id, tokens.refreshToken);
    this.sessionService
      .upsertSession(user.id, deviceLabel ?? 'Unknown', ipAddress, deviceId, platform, userAgent)
      .catch(() => {});
    const isProfileComplete = !!user.phone;
    return { ...tokens, user: this.tokenService.safeUser(user), isProfileComplete };
  }
}
