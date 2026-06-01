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

@Entity('driver_monthly_stats')
@Index(['driverId', 'month'], { unique: true })
export class DriverMonthlyStats {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'driver_id', type: 'uuid' })
  driverId: string;

  @Column({ name: 'month', type: 'varchar', length: 7 })
  month: string;

  @Column({ name: 'rides_count', type: 'int', default: 0 })
  ridesCount: number;

  @Column({ name: 'tier_achieved_id', type: 'uuid', nullable: true, default: null })
  tierAchievedId: string | null;

  @Column({
    name: 'total_earnings',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  totalEarnings: number;

  @Column({
    name: 'total_commission',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  totalCommission: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
