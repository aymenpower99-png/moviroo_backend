import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('membership_levels')
export class MembershipLevelEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ name: 'required_points', type: 'int', default: 0 })
  requiredPoints: number;

  @Column({
    name: 'discount_percentage',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string | number) => parseFloat(v as string),
    },
  })
  discountPercentage: number;

  /** Level number (1–10) — controls display order and progression hierarchy */
  @Column({ name: 'level', type: 'int', default: 1 })
  level: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
