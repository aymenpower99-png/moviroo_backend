import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

/* ── Enums ─────────────────────────────────────────────── */

export enum EarningStatus {
  PENDING    = 'PENDING',
  CALCULATED = 'CALCULATED',
  LOCKED     = 'LOCKED',
  PAID       = 'PAID',
}

/* ── Numeric transformer ───────────────────────────────── */

const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null ? null : parseFloat(value),
};

/* ── Entity ────────────────────────────────────────────── */

@Entity('driver_earnings')
@Unique(['driverId', 'month'])
export class DriverEarning {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'driver_id', type: 'uuid' })
  driverId: string;

  /** Format: YYYY-MM (e.g. "2026-04") */
  @Column({ type: 'varchar', length: 7 })
  month: string;

  /* ── Salary breakdown ── */
  @Column({
    name: 'fixed_salary',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  fixedSalary: number;

  @Column({
    name: 'total_bonuses',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  totalBonuses: number;

  @Column({
    name: 'total_penalties',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  totalPenalties: number;

  @Column({
    name: 'net_earnings',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  netEarnings: number;

  /* ── Attendance & deductions (22-day model) ── */
  @Column({ type: 'int', default: 0 })
  attendance: number;

  @Column({ name: 'missed_days', type: 'int', default: 0 })
  missedDays: number;

  @Column({
    name: 'deduction_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  deductionAmount: number;

  /** Comma-separated attendance dates (YYYY-MM-DD) */
  @Column({ name: 'attendance_days', type: 'text', default: '' })
  attendanceDays: string;

  /* ── Commission tier breakdown (JSONB) ── */
  @Column({ name: 'commission_breakdown', type: 'jsonb', default: '[]' })
  commissionBreakdown: { tierId: string; tierName: string; requiredRides: number; bonusAmount: number; reached: boolean }[];

  /* ── Performance metrics (snapshot) ── */
  @Column({ name: 'completed_trips', type: 'int', default: 0 })
  completedTrips: number;

  @Column({
    name: 'avg_rating',
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  avgRating: number;

  @Column({ name: 'cancellation_count', type: 'int', default: 0 })
  cancellationCount: number;

  /* ── Status ── */
  @Column({
    name: 'earning_status',
    type: 'text',
    default: EarningStatus.PENDING,
  })
  earningStatus: EarningStatus;

  @Column({ name: 'calculated_at', type: 'timestamptz', nullable: true, default: null })
  calculatedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

