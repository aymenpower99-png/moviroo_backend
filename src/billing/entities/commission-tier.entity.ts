import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null ? null : parseFloat(value),
};

@Entity('commission_tiers')
export class CommissionTier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Human-readable label (e.g. "Bronze", "Silver") */
  @Column({ type: 'varchar', length: 50 })
  name: string;

  /** Number of completed rides required to earn this tier */
  @Column({ name: 'required_rides', type: 'int' })
  requiredRides: number;

  /** Bonus amount (TND) earned when driver reaches this tier */
  @Column({
    name: 'bonus_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  bonusAmount: number;

  /** Display order (lowest first) */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
