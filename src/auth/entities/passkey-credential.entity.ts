import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Stores WebAuthn/FIDO2 passkey credentials for passwordless authentication.
 * Each row represents one registered passkey (public key) for a user.
 */
@Entity('passkey_credentials')
export class PasskeyCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  /** WebAuthn credential ID (base64url). */
  @Column({ name: 'credential_id', type: 'text', unique: true })
  credentialId: string;

  /** COSE-encoded public key (base64url). */
  @Column({ name: 'public_key', type: 'text' })
  publicKey: string;

  /** Signature counter for clone detection. */
  @Column({ type: 'bigint', default: 0 })
  counter: number;

  /** Authenticator transports (e.g., 'internal', 'hybrid'). */
  @Column({ name: 'transports', type: 'text', array: true, nullable: true })
  transports: string[] | null;

  /** Human-readable label set by the user (e.g. "My iPhone"). */
  @Column({ name: 'device_name', type: 'varchar', length: 255, nullable: true })
  deviceName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;
}
