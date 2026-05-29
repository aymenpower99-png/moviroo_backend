import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entites/user.entity';

export enum DriverAvailabilityStatus {
  PENDING = 'pending',
  SETUP_REQUIRED = 'setup_required',
  OFFLINE = 'offline',
  ONLINE = 'online',
}

@Entity('drivers')
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({
    name: 'rating_average',
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 5.0,
  })
  ratingAverage: number;

  @Column({ name: 'total_ratings', type: 'int', default: 0 })
  totalRatings: number;

  @Column({ name: 'total_trips', type: 'int', default: 0 })
  totalTrips: number;

  @Column({
    name: 'availability_status',
    type: 'enum',
    enum: DriverAvailabilityStatus,
    enumName: 'driver_availability_status',
    default: DriverAvailabilityStatus.PENDING,
  })
  availabilityStatus: DriverAvailabilityStatus;

  @Column({ name: 'work_area_id', type: 'uuid', nullable: true, default: null })
  workAreaId: string | null;

  /** Current commission tier the driver has unlocked this month */
  @Column({ name: 'current_tier_id', type: 'uuid', nullable: true, default: null })
  currentTierId: string | null;

  /** Active commission rate (0.0–1.0) applied to each completed ride */
  @Column({
    name: 'current_commission_rate',
    type: 'decimal',
    precision: 5,
    scale: 4,
    nullable: true,
    default: 0.25,
    transformer: {
      to: (value: number | null): number | null => value,
      from: (value: string | null): number | null =>
        value === null ? null : parseFloat(value),
    },
  })
  currentCommissionRate: number | null;

  /* ── Salary & Performance ──────────────────────── */

  @Column({
    name: 'fixed_monthly_salary',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 800,
  })
  fixedMonthlySalary: number;

  @Column({ name: 'cancellation_count', type: 'int', default: 0 })
  cancellationCount: number;

  @Column({ name: 'rejected_offers_count', type: 'int', default: 0 })
  rejectedOffersCount: number;

  @Column({ name: 'accepted_offers_count', type: 'int', default: 0 })
  acceptedOffersCount: number;

  @Column({
    name: 'notif_push_enabled',
    type: 'boolean',
    nullable: true,
    default: true,
  })
  notifPushEnabled: boolean | null;

  @Column({
    name: 'notif_email_enabled',
    type: 'boolean',
    nullable: true,
    default: true,
  })
  notifEmailEnabled: boolean | null;

  /* ── Session Tracking ──────────────────────────────────────── */

  /** Timestamp when the driver started the current online session. Null when offline. */
  @Column({
    name: 'online_since',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  onlineSince: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
