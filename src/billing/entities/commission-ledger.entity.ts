import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null ? null : parseFloat(value),
};

/**
 * CommissionLedger records one-time tier payouts per driver per month.
 * Uniqueness is enforced by (driverId, periodKey, tierId) to prevent duplicates.
 */
@Entity('commission_ledger')
@Index(['driverId', 'periodKey', 'tierId'], { unique: true })
export class CommissionLedger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'driver_id', type: 'uuid' })
  driverId: string;

  /** Period key in format YYYY-MM (business TZ-resolved externally) */
  @Column({ name: 'period_key', type: 'varchar', length: 7 })
  periodKey: string;

  @Column({ name: 'tier_id', type: 'uuid' })
  tierId: string;

  /** Bonus amount (TND) awarded for this tier */
  @Column({
    name: 'amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  amount: number;

  @CreateDateColumn({ name: 'awarded_at' })
  awardedAt: Date;
}
