import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Tracks active login sessions for a user.
 * Used for the "Active Sessions" security feature — lets users see
 * where their account is logged in and sign out all devices at once.
 *
 * NOTE: This is an audit / visibility table. Per-device token revocation
 * requires migrating to a multi-token architecture (one refresh token per
 * session). "Sign out all devices" works correctly by clearing
 * User.refreshToken, which invalidates all concurrent sessions.
 */
@Entity('user_sessions')
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  /** Human-readable device/platform label (e.g. "android", "ios"). */
  @Column({ name: 'device_label', length: 100, default: 'Unknown' })
  deviceLabel: string;

  @Column({ name: 'ip_address', type: 'varchar', length: 50, nullable: true, default: null })
  ipAddress: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({
    name: 'last_seen_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastSeenAt: Date;
}
