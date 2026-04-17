import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('monthly_earnings')
@Unique(['driverId', 'year', 'month'])
export class MonthlyEarnings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'driver_id', type: 'uuid' })
  driverId: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'int' })
  month: number;

  @Column({ name: 'base_salary', type: 'numeric', precision: 10, scale: 2, default: 3000 })
  baseSalary: number;

  @Column({ name: 'expected_work_days', type: 'int', default: 22 })
  expectedWorkDays: number;

  @Column({ type: 'int', default: 0 })
  attendance: number;

  @Column({ name: 'missed_days', type: 'int', default: 0 })
  missedDays: number;

  @Column({ name: 'deduction_amount', type: 'numeric', precision: 10, scale: 2, default: 0 })
  deductionAmount: number;

  @Column({ name: 'rides_completed', type: 'int', default: 0 })
  ridesCompleted: number;

  @Column({ name: 'rides_accepted', type: 'int', default: 0 })
  ridesAccepted: number;

  @Column({ name: 'rides_cancelled', type: 'int', default: 0 })
  ridesCancelled: number;

  @Column({ name: 'rides_threshold', type: 'int', default: 100 })
  ridesThreshold: number;

  @Column({ name: 'commission_per_ride', type: 'numeric', precision: 10, scale: 2, default: 2 })
  commissionPerRide: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  commission: number;

  @Column({ name: 'total_earnings', type: 'numeric', precision: 10, scale: 2, default: 0 })
  totalEarnings: number;

  @Column({ name: 'weekly_breakdown', type: 'jsonb', default: '[]' })
  weeklyBreakdown: { week: number; salary: number; commission: number; rides: number }[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
