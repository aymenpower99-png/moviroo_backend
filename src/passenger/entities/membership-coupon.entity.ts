import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum CouponStatus {
  ACTIVE = 'active',
  USED   = 'used',
}

@Entity('membership_coupons')
export class MembershipCouponEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'level_id', type: 'uuid' })
  levelId: string;

  /** Level number (1–10) stored for quick reference */
  @Column({ name: 'level', type: 'int' })
  level: number;

  @Column({ name: 'code', type: 'varchar', length: 30, unique: true })
  code: string;

  @Column({
    name: 'discount_percentage',
    type: 'decimal',
    precision: 5,
    scale: 2,
    transformer: {
      to: (v: number) => v,
      from: (v: string | number) => parseFloat(v as string),
    },
  })
  discountPercentage: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: CouponStatus,
    enumName: 'coupon_status',
    default: CouponStatus.ACTIVE,
  })
  status: CouponStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true, default: null })
  usedAt: Date | null;
}
