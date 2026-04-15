import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
} from 'typeorm';

export enum MembershipLevel {
  GO    = 'Moviroo Go',
  MAX   = 'Moviroo Max',
  ELITE = 'Moviroo Elite',
  VIP   = 'Moviroo Vip',
}

export enum PaymentMethod {
  CARD          = 'card',
  CASH          = 'cash',
  WALLET        = 'wallet',
  BANK_TRANSFER = 'bank_transfer',
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

  /**
   * Optional: preferred class UUID (FK to classes table).
   * NULL = no preference yet — passenger always picks class at booking time.
   * Set automatically after first booking, or manually from profile settings.
   */
  @Column({ name: 'preferred_class_id', type: 'uuid', nullable: true, default: null })
  preferredClassId: string | null;

  @Column({
    name: 'default_payment_method',
    type: 'varchar',
    length: 50,
    nullable: true,
    default: null,
  })
  defaultPaymentMethod: PaymentMethod | null;

  @Column({ name: 'payment_addresses', type: 'jsonb', nullable: true, default: null })
  paymentAddresses: PaymentAddress[] | null;

  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 255, unique: true, nullable: true, default: null })
  stripeCustomerId: string | null;

  @Column({ name: 'membership_points', type: 'int', default: 0 })
  membershipPoints: number;

  @Column({
    name: 'membership_level',
    type: 'enum',
    enum: MembershipLevel,
    enumName: 'membership_level',
    default: MembershipLevel.GO,
  })
  membershipLevel: MembershipLevel;

  @Column({ name: 'total_bookings', type: 'int', default: 0 })
  totalBookings: number;

  @Column({ name: 'rating_average', type: 'decimal', precision: 3, scale: 2, default: 5.0 })
  ratingAverage: number;

  @Column({ name: 'total_ratings', type: 'int', default: 0 })
  totalRatings: number;

  @Column({ name: 'emergency_contact_name', type: 'varchar', length: 100, nullable: true, default: null })
  emergencyContactName: string | null;

  @Column({ name: 'emergency_contact_phone', type: 'varchar', length: 20, nullable: true, default: null })
  emergencyContactPhone: string | null;

  @Column({ name: 'newsletter_opt_in', type: 'boolean', default: false })
  newsletterOptIn: boolean;

  @Column({ name: 'referral_code', type: 'varchar', length: 20, unique: true, nullable: true, default: null })
  referralCode: string | null;

  @Column({ name: 'referred_by', type: 'uuid', nullable: true, default: null })
  referredBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}