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

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true, nullable: true })
  phone: string;

  @Column({
    name: 'password_hash',
    type: 'text',
    nullable: true,
    default: null,
  })
  password: string | null;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl: string;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ name: 'phone_verified', default: false })
  phoneVerified: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_banned', default: false })
  isBanned: boolean;

  @Column({ name: 'ban_reason', nullable: true })
  banReason: string;

  @Column({
    name: 'refresh_token',
    type: 'text',
    nullable: true,
    default: null,
  })
  refreshToken: string | null;

  @Column({ name: 'last_login_at', nullable: true })
  lastLoginAt: Date;

  // ─── Role ─────────────────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: UserRole, default: UserRole.PASSENGER })
  role: UserRole;

  // ─── Status ───────────────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING })
  status: UserStatus;

  // ─── Invitation Token ────────��────────────────────────────────────────────

  @Column({ name: 'invite_token', type: 'text', nullable: true, default: null })
  inviteToken: string | null;

  // ─── Agency ───────────────────────────────────────────────────────────────

  @Column({ name: 'agency_id', type: 'uuid', nullable: true, default: null })
  agencyId: string | null;

  // ─── 2-Step Verification (email OTP) ─────────────────────────────────────

  @Column({ name: 'is_2fa_enabled', default: false })
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

  // ─── Password Reset ───────────────────────────────────────────────────────

  @Column({
    name: 'password_reset_token', // ← explicit snake_case name
    type: 'varchar',
    nullable: true,
    default: null,
  })
  passwordResetToken: string | null;

  @Column({
    name: 'password_reset_expiry', // ← explicit snake_case name
    type: 'timestamp',
    nullable: true,
    default: null,
  })
  passwordResetExpiry: Date | null;

  // ─── TOTP (Authenticator App) ─────────────────���───────────────────────────

  @Column({ name: 'totp_secret', type: 'text', nullable: true, default: null })
  totpSecret: string | null;

  @Column({ name: 'totp_enabled', default: false })
  totpEnabled: boolean;

  // ─── Email Change ─────────────────────────────────────────────────────────

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

  // ─── Timestamps ───────────────────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
