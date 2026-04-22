import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  AGENCY = 'agency',
  DRIVER = 'driver',
  PASSENGER = 'passenger',
}

export enum UserStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}

export enum UserProvider {
  MANUAL = 'manual',
  GOOGLE = 'google',
  APPLE = 'apple',
  FACEBOOK = 'facebook',
}

export enum TwoFactorMethod {
  EMAIL = 'email',
  TOTP = 'totp',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar', unique: true, nullable: true, default: null })
  phone: string | null;

  @Column({
    name: 'password_hash',
    type: 'text',
    nullable: true,
    default: null,
  })
  password: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName: string;

  @Column({ name: 'avatar_url', type: 'text', nullable: true, default: null })
  avatarUrl: string | null;

  @Column({ name: 'email_verified', type: 'boolean', default: false })
  emailVerified: boolean;

  @Column({ name: 'phone_verified', type: 'boolean', default: false })
  phoneVerified: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_banned', type: 'boolean', default: false })
  isBanned: boolean;

  @Column({ name: 'ban_reason', type: 'text', nullable: true, default: null })
  banReason: string | null;

  @Column({
    name: 'refresh_token',
    type: 'text',
    nullable: true,
    default: null,
  })
  refreshToken: string | null;

  @Column({
    name: 'last_login_at',
    type: 'timestamp',
    nullable: true,
    default: null,
  })
  lastLoginAt: Date | null;

  @Column({
    type: 'enum',
    enum: UserRole,
    enumName: 'users_role_enum',
    default: UserRole.PASSENGER,
  })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    enumName: 'users_status_enum',
    default: UserStatus.PENDING,
  })
  status: UserStatus;

  @Column({
    name: 'invite_token',
    type: 'text',
    nullable: true,
    default: null,
  })
  inviteToken: string | null;

  @Column({
    type: 'enum',
    enum: UserProvider,
    enumName: 'users_provider_enum',
    default: UserProvider.MANUAL,
  })
  provider: UserProvider;

  @Column({ name: 'agency_id', type: 'uuid', nullable: true, default: null })
  agencyId: string | null;

  @Column({ name: 'is_2fa_enabled', type: 'boolean', default: false })
  is2faEnabled: boolean;

  @Column({ name: 'otp_code', type: 'text', nullable: true, default: null })
  otpCode: string | null;

  @Column({
    name: 'otp_expiry',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  otpExpiry: Date | null;

  @Column({
    name: 'password_reset_token',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  passwordResetToken: string | null;

  @Column({
    name: 'password_reset_expiry',
    type: 'timestamp',
    nullable: true,
    default: null,
  })
  passwordResetExpiry: Date | null;

  @Column({ name: 'totp_secret', type: 'text', nullable: true, default: null })
  totpSecret: string | null;

  @Column({ name: 'totp_enabled', type: 'boolean', default: false })
  totpEnabled: boolean;

  // Primary 2FA method used at login time ('email' or 'totp').
  // null means no 2FA primary selected (user has no 2FA on).
  @Column({
    name: 'primary_2fa_method',
    type: 'enum',
    enum: TwoFactorMethod,
    enumName: 'users_primary_2fa_method_enum',
    nullable: true,
    default: null,
  })
  primary2faMethod: TwoFactorMethod | null;

  // Passkey (device-level biometric) enabled for sensitive actions only.
  @Column({ name: 'passkey_enabled', type: 'boolean', default: false })
  passkeyEnabled: boolean;

  // Short-lived action token expiry (proves a recent biometric/password challenge).
  @Column({
    name: 'action_token_expiry',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  actionTokenExpiry: Date | null;

  @Column({
    name: 'pending_email',
    type: 'text',
    nullable: true,
    default: null,
  })
  pendingEmail: string | null;

  @Column({
    name: 'email_change_token',
    type: 'text',
    nullable: true,
    default: null,
  })
  emailChangeToken: string | null;

  @Column({
    name: 'email_change_expiry',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  emailChangeExpiry: Date | null;

  @Column({
    name: 'fcm_token',
    type: 'varchar',
    length: 500,
    nullable: true,
    default: null,
  })
  fcmToken: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
