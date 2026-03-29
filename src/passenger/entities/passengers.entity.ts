import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { User } from '../../users/entites/user.entity';

export enum MembershipLevel {
  GO    = 'Moviroo Go',
  MAX   = 'Moviroo Max',
  ELITE = 'Moviroo Elite',
  VIP   = 'Moviroo Vip',  // ← lowercase p
}


export enum VehicleType {
  STANDARD = 'standard',
  COMFORT  = 'comfort',
  VAN      = 'van',
  MOTO     = 'moto',
}

export enum PaymentMethod {
  CARD = 'card',
}

export interface PaymentAddress {
  label?:     string;
  address:    string;
  city:       string;
  province:   string;
  postalCode: string;
  lat:        number;
  lng:        number;
}

@Entity('passengers')
export class PassengerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // ─── Vehicle Preference ───────────────────────────────────────────────────
  @Column({
    name: 'preferred_vehicle_type',
    type: 'enum',
    enum: VehicleType,
    default: VehicleType.STANDARD,
  })
  preferredVehicleType: VehicleType;

  // ─── Payment ──────────────────────────────────────────────────────────────
  @Column({
    name: 'default_payment_method',
    type: 'enum',
    enum: PaymentMethod,
    nullable: true,
  })
  defaultPaymentMethod: PaymentMethod | null;

  // ─── Payment Addresses ────────────────────────────────────────────────────
  @Column({ name: 'payment_addresses', type: 'jsonb', nullable: true })
  paymentAddresses: PaymentAddress[] | null;

  // ─── Stripe ───────────────────────────────────────────────────────────────
  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 255, unique: true, nullable: true })
  stripeCustomerId: string | null;

  // ─── Loyalty & Membership ─────────────────────────────────────────────────
  @Column({ name: 'membership_points', type: 'int', default: 0 })
  membershipPoints: number;

  @Column({
    name: 'membership_level',
    type: 'enum',
    enum: MembershipLevel,
    default: MembershipLevel.GO,
  })
  membershipLevel: MembershipLevel;

  // ─── Stats ────────────────────────────────────────────────────────────────
  @Column({ name: 'total_bookings', type: 'int', default: 0 })
  totalBookings: number;

  @Column({ name: 'rating_average', type: 'decimal', precision: 3, scale: 2, default: 5.0 })
  ratingAverage: number;

  @Column({ name: 'total_ratings', type: 'int', default: 0 })
  totalRatings: number;

  // ─── Emergency Contact ────────────────────────────────────────────────────
  @Column({ name: 'emergency_contact_name', type: 'varchar', length: 100, nullable: true })
  emergencyContactName: string | null;

  @Column({ name: 'emergency_contact_phone', type: 'varchar', length: 20, nullable: true })
  emergencyContactPhone: string | null;

  // ─── Misc ─────────────────────────────────────────────────────────────────
  @Column({ name: 'newsletter_opt_in', type: 'boolean', default: false })
  newsletterOptIn: boolean;

  // ─── Referral ─────────────────────────────────────────────────────────────
  @Column({ name: 'referral_code', type: 'varchar', length: 20, unique: true, nullable: true })
  referralCode: string | null;

  @Column({ name: 'referred_by', type: 'uuid', nullable: true })
  referredBy: string | null;

  // ─── Timestamps ───────────────────────────────────────────────────────────
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}