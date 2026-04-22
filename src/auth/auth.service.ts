import {
  ConflictException,
  ForbiddenException,
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
  UserRole,
  UserStatus,
  TwoFactorMethod,
} from '../users/entites/user.entity';
import {
  Driver,
  DriverAvailabilityStatus,
} from '../driver/entities/driver.entity';
import {
  PassengerEntity,
  MembershipLevel,
} from '../passenger/entities/passengers.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleSignInDto } from './dto/google-signin.dto';
import { AppleSignInDto } from './dto/apple-signin.dto';
import { OtpService } from '../otp/otp.service';
import { AuthMailService } from '../mail/services/auth-mail.service';
import { WelcomeMailService } from '../mail/services/welcome-mail.service';
import { UserProvider } from '../users/entites/user.entity';

// ── No VehicleType import — it no longer exists ──────────────────────────────

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}
interface PreAuthPayload {
  sub: string;
  email: string;
  preAuth: true;
  method: 'email' | 'totp';
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Driver) private driverRepo: Repository<Driver>,
    @InjectRepository(PassengerEntity)
    private passengerRepo: Repository<PassengerEntity>,
    private jwtService: JwtService,
    private config: ConfigService,
    private otpService: OtpService,
    private authMail: AuthMailService,
    private welcomeMail: WelcomeMailService,
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
      if (emailExists.provider === UserProvider.APPLE) {
        throw new ConflictException(
          'This email is already registered using Apple. Please log in with Apple.',
        );
      }

      // If manual account exists but email not verified, update & resend link
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

    // Check phone uniqueness (excluding unverified accounts that may share the phone)
    const phoneExists = await this.userRepo.findOne({
      where: { phone: dto.phone },
    });
    if (phoneExists && phoneExists.emailVerified) {
      throw new ConflictException('Phone number already in use');
    }
    // If phone belongs to an unverified account, clear it so this user can take it
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

    // Generate a signed JWT token for email verification (30 min expiry)
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

    // Generate tokens for auto-login
    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      message: 'Email verified successfully.',
      ...tokens,
      user: this.safeUser(user),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user || !user.password)
      throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // Check email verification first — resend link if not verified
    if (!user.emailVerified) {
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
          'Please verify your email first. A new verification link has been sent.',
        requiresVerification: true,
        stage: 'verify-email',
        userId: user.id,
      };
    }

    if (user.status === UserStatus.BLOCKED)
      throw new ForbiddenException(
        'Your account has been blocked. Please contact support.',
      );

    if (user.role === UserRole.DRIVER) {
      const driverProfile = await this.driverRepo.findOne({
        where: { userId: user.id },
      });
      if (!driverProfile) {
        throw new ForbiddenException(
          'Your account is being prepared by the agency.',
        );
      }
    }

    // ── Pick 2FA method by primary selection ──────────────────────────────
    // Fallback priority if primary is somehow null but a method is on:
    //   TOTP > Email > none
    const preferredMethod: TwoFactorMethod | null =
      user.primary2faMethod ??
      (user.totpEnabled
        ? TwoFactorMethod.TOTP
        : user.is2faEnabled
          ? TwoFactorMethod.EMAIL
          : null);

    if (preferredMethod === TwoFactorMethod.TOTP && user.totpEnabled) {
      const preAuthToken = await this.issuePreAuthToken(user, 'totp');
      return {
        message: 'Enter the code from your authenticator app.',
        requiresOtp: true,
        stage: 'login-totp',
        userId: user.id,
        preAuthToken,
      };
    }

    if (preferredMethod === TwoFactorMethod.EMAIL && user.is2faEnabled) {
      const code = await this.otpService.generateOtp(user.id);
      await this.authMail.sendOtp(user.email, user.firstName, code, 'login');
      const preAuthToken = await this.issuePreAuthToken(user, 'email');
      return {
        message: 'Check your email for a verification code.',
        requiresOtp: true,
        stage: 'login-otp',
        userId: user.id,
        email: user.email,
        preAuthToken,
      };
    }

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return { ...tokens, user: this.safeUser(user) };
  }

  async verifyLoginOtp(preAuthToken: string, code: string) {
    let payload: PreAuthPayload;
    try {
      payload = await this.jwtService.verifyAsync<PreAuthPayload>(
        preAuthToken,
        {
          secret: this.config.get<string>('jwt.accessSecret')!,
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired pre-auth token');
    }

    if (!payload.preAuth) throw new UnauthorizedException('Invalid token type');

    payload.method === 'totp'
      ? await this.otpService.verifyTotpCode(payload.sub, code)
      : await this.otpService.verifyOtp(payload.sub, code);

    const user = await this.userRepo.findOneOrFail({
      where: { id: payload.sub },
    });
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return { ...tokens, user: this.safeUser(user) };
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

  async resendOtp(userId: string, purpose: 'verify-email' | 'login') {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    const code = await this.otpService.generateOtp(user.id);
    await this.authMail.sendOtp(user.email, user.firstName, code, purpose);
    return { message: 'A new verification code has been sent to your email.' };
  }

  async setupTotp(user: User) {
    return this.otpService.generateTotpSecret(user);
  }

  async confirmTotpSetup(userId: string, code: string) {
    await this.otpService.verifyAndEnableTotp(userId, code);

    // Auto-select TOTP as primary if user had none yet.
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    if (!user.primary2faMethod) {
      await this.userRepo.update(userId, {
        primary2faMethod: TwoFactorMethod.TOTP,
      });
    }

    return {
      message: 'Authenticator app linked successfully.',
      totpEnabled: true,
      primary2faMethod: user.primary2faMethod ?? TwoFactorMethod.TOTP,
    };
  }

  async disableTotp(userId: string) {
    await this.otpService.disableTotp(userId);

    // If TOTP was primary, fall back to email if enabled, else null.
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    let newPrimary = user.primary2faMethod;
    if (user.primary2faMethod === TwoFactorMethod.TOTP) {
      newPrimary = user.is2faEnabled ? TwoFactorMethod.EMAIL : null;
      await this.userRepo.update(userId, { primary2faMethod: newPrimary });
    }

    return {
      message: 'Authenticator app unlinked.',
      totpEnabled: false,
      primary2faMethod: newPrimary,
    };
  }

  async toggle2fa(userId: string, enable: boolean, otp?: string) {
    // When enabling, verify the OTP if one was provided.
    if (enable && otp) {
      await this.otpService.verifyOtp(userId, otp);
    }
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });

    const patch: Partial<User> = { is2faEnabled: enable };

    if (enable) {
      // Auto-select Email as primary if user had none yet.
      if (!user.primary2faMethod) {
        patch.primary2faMethod = TwoFactorMethod.EMAIL;
      }
    } else {
      // Disabling email 2FA: if it was primary, fall back to TOTP if on, else null.
      if (user.primary2faMethod === TwoFactorMethod.EMAIL) {
        patch.primary2faMethod = user.totpEnabled ? TwoFactorMethod.TOTP : null;
      }
    }

    await this.userRepo.update(userId, patch);

    return {
      message: enable
        ? '2-step verification enabled.'
        : '2-step verification disabled.',
      is2faEnabled: enable,
      primary2faMethod: patch.primary2faMethod ?? user.primary2faMethod ?? null,
    };
  }

  // ─── Primary 2FA method switching ─────────────────────────────────────────
  // Caller must prove they control the *current* primary method via OTP/TOTP code.
  // code is interpreted against the CURRENT primary method (email OTP or TOTP).
  async switchPrimary2faMethod(
    userId: string,
    method: TwoFactorMethod,
    verificationCode: string,
  ) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });

    // Target method must actually be activated
    if (method === TwoFactorMethod.EMAIL && !user.is2faEnabled) {
      throw new UnauthorizedException('Email 2FA is not enabled.');
    }
    if (method === TwoFactorMethod.TOTP && !user.totpEnabled) {
      throw new UnauthorizedException('Authenticator app is not enabled.');
    }

    // No-op if already primary
    if (user.primary2faMethod === method) {
      return {
        message: 'Primary method unchanged.',
        primary2faMethod: method,
      };
    }

    // Verify identity via the CURRENT primary method (or the target if no primary yet).
    const verifyAgainst = user.primary2faMethod ?? method;
    if (verifyAgainst === TwoFactorMethod.TOTP) {
      await this.otpService.verifyTotpCode(userId, verificationCode);
    } else {
      await this.otpService.verifyOtp(userId, verificationCode);
    }

    await this.userRepo.update(userId, { primary2faMethod: method });

    return {
      message: 'Primary 2FA method updated.',
      primary2faMethod: method,
    };
  }

  // Sends an OTP to the user's email so they can prove ownership before enabling email 2FA.
  // Unlike sendPrimarySwitchEmailOtp, this does NOT require 2FA to already be enabled.
  async sendEmail2faEnableOtp(userId: string) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    const code = await this.otpService.generateOtp(userId);
    await this.authMail.sendOtp(user.email, user.firstName, code, 'login');
    return { message: 'Verification code sent to your email.' };
  }

  // Helper to send a fresh email OTP (used when user wants to switch primary to/from email).
  async sendPrimarySwitchEmailOtp(userId: string) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    if (!user.is2faEnabled) {
      throw new UnauthorizedException('Email 2FA is not enabled.');
    }
    const code = await this.otpService.generateOtp(userId);
    await this.authMail.sendOtp(user.email, user.firstName, code, 'login');
    return { message: 'Verification code sent to your email.' };
  }

  async refresh(user: User) {
    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async logout(userId: string) {
    await this.userRepo.update(userId, { refreshToken: null });
    return { message: 'Logged out successfully' };
  }

  private async issuePreAuthToken(user: User, method: 'email' | 'totp') {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        preAuth: true,
        method,
      } satisfies PreAuthPayload,
      {
        secret: this.config.get<string>('jwt.accessSecret')!,
        expiresIn: '10m',
      },
    );
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('jwt.accessSecret')!,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('jwt.refreshSecret')!,
        expiresIn: '7d',
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, token: string) {
    const hashed = await bcrypt.hash(token, 12);
    await this.userRepo.update(userId, { refreshToken: hashed });
  }

  safeUser(user: User) {
    const {
      password,
      refreshToken,
      otpCode,
      totpSecret,
      inviteToken,
      emailChangeToken,
      actionTokenExpiry,
      ...safe
    } = user;
    return { ...safe, emailChangePending: !!safe.pendingEmail };
  }

  // ─── OAuth: Google Sign-In ─────────────────────────────────────────────────────

  async googleSignIn(dto: GoogleSignInDto) {
    // TODO: Verify Google ID token using Google OAuth client library
    // For now, extract email from token (simplified - implement proper verification in production)
    const payload = this.parseJwt(dto.idToken);
    const email = payload.email as string;
    const firstName = (payload.given_name as string) || '';
    const lastName = (payload.family_name as string) || '';

    let user = await this.userRepo.findOne({ where: { email } });

    if (user) {
      // Block if registered with a different provider
      if (user.provider === UserProvider.MANUAL) {
        throw new ConflictException(
          'This email is already registered with email and password. Please log in with your email and password.',
        );
      }
      if (user.provider === UserProvider.APPLE) {
        throw new ConflictException(
          'This email is already registered using Apple. Please log in with Apple.',
        );
      }

      // Check status
      if (user.status === UserStatus.BLOCKED) {
        throw new ForbiddenException(
          'Your account has been blocked. Please contact support.',
        );
      }
    } else {
      // New user - create account with Google provider
      user = this.userRepo.create({
        email,
        firstName,
        lastName,
        provider: UserProvider.GOOGLE,
        emailVerified: true, // Google verifies email
        status: UserStatus.ACTIVE,
        role: UserRole.PASSENGER, // Default to passenger for OAuth
      });
      await this.userRepo.save(user);

      // Create passenger profile
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

      // Send welcome email
      this.welcomeMail.sendWelcome(user.role, user.email, user.firstName);
    }

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return { ...tokens, user: this.safeUser(user) };
  }

  // ─── OAuth: Apple Sign-In ─────────────────────────────────────────────────────

  async appleSignIn(dto: AppleSignInDto) {
    // TODO: Verify Apple ID token using Apple public keys
    // For now, extract email from token (simplified - implement proper verification in production)
    const payload = this.parseJwt(dto.idToken);
    const email = payload.email as string;

    let user = await this.userRepo.findOne({ where: { email } });

    if (user) {
      // Block if registered with a different provider
      if (user.provider === UserProvider.MANUAL) {
        throw new ConflictException(
          'This email is already registered with email and password. Please log in with your email and password.',
        );
      }
      if (user.provider === UserProvider.GOOGLE) {
        throw new ConflictException(
          'This email is already registered using Google. Please log in with Google.',
        );
      }

      // Check status
      if (user.status === UserStatus.BLOCKED) {
        throw new ForbiddenException(
          'Your account has been blocked. Please contact support.',
        );
      }
    } else {
      // New user - create account with Apple provider
      // Apple may not provide name on subsequent sign-ins
      const fullName = dto.fullName || '';
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || 'User';
      const lastName = nameParts.slice(1).join(' ') || '';

      user = this.userRepo.create({
        email,
        firstName,
        lastName,
        provider: UserProvider.APPLE,
        emailVerified: true, // Apple verifies email
        status: UserStatus.ACTIVE,
        role: UserRole.PASSENGER, // Default to passenger for OAuth
      });
      await this.userRepo.save(user);

      // Create passenger profile
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

      // Send welcome email
      this.welcomeMail.sendWelcome(user.role, user.email, user.firstName);
    }

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    const tokens = await this.generateTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return { ...tokens, user: this.safeUser(user) };
  }

  // Helper to parse JWT (for OAuth token verification - replace with proper verification in production)
  private parseJwt(token: string): any {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload);
  }
}
