import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('earnings_config')
export class EarningsConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'base_salary', type: 'numeric', precision: 10, scale: 2, default: 3000 })
  baseSalary: number;

  @Column({ name: 'expected_work_days', type: 'int', default: 22 })
  expectedWorkDays: number;

  @Column({ name: 'rides_threshold', type: 'int', default: 100 })
  ridesThreshold: number;

  @Column({ name: 'commission_per_ride', type: 'numeric', precision: 10, scale: 2, default: 2 })
  commissionPerRide: number;

  @Column({ name: 'min_acceptance_rate', type: 'numeric', precision: 5, scale: 2, nullable: true, default: null })
  minAcceptanceRate: number | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
