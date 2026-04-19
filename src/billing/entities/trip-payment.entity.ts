import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { User } from '../../users/entites/user.entity';

/* ── TypeScript Enums (KEEP ONLY FOR CODE SAFETY) ── */

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentMethod {
  CARD = 'CARD',
  CASH = 'CASH',
}

/* ── Numeric transformer ── */

const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null ? null : parseFloat(value),
};

/* ── Entity ── */

@Entity('trip_payments')
export class TripPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /* ── Ride reference ── */
  @Column({ name: 'ride_id', type: 'uuid', unique: true })
  rideId: string;

  @ManyToOne(() => Ride, { eager: false })
  @JoinColumn({ name: 'ride_id' })
  ride: Ride;

  /* ── Passenger ── */
  @Column({ name: 'passenger_id', type: 'uuid' })
  passengerId: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'passenger_id' })
  passenger: User;

  /* ── Driver ── */
  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  driverId: string | null;

  @ManyToOne(() => User, { eager: false, nullable: true })
  @JoinColumn({ name: 'driver_id' })
  driver: User | null;

  /* ── Amount ── */
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'TND' })
  currency: string;

  /* ── STATUS (NOW TEXT) ── */
  @Column({
    name: 'payment_status',
    type: 'text',
    default: PaymentStatus.PENDING,
  })
  paymentStatus: PaymentStatus;

  /* ── METHOD (NOW TEXT) ── */
  @Column({
    name: 'payment_method',
    type: 'text',
    nullable: true,
    default: null,
  })
  paymentMethod: PaymentMethod | null;

  /* ── Stripe fields ── */
  @Column({
    name: 'stripe_payment_intent_id',
    type: 'varchar',
    length: 255,
    nullable: true,
    default: null,
  })
  stripePaymentIntentId: string | null;

  @Column({
    name: 'stripe_client_secret',
    type: 'varchar',
    length: 255,
    nullable: true,
    default: null,
  })
  stripeClientSecret: string | null;

  /* ── Timestamps ── */
  @Column({
    name: 'paid_at',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  paidAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}