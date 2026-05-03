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
  })
  discountPercentage: number;

  /** Controls display order and progression hierarchy — lower = first tier */
  @Column({ name: 'order', type: 'int', default: 0 })
  order: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
