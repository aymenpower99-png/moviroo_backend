import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { TripPayment } from './trip-payment.entity';

/* ── Enums ─────────────────────────────────────────────── */

export enum TransactionType {
  RIDE_PAYMENT = 'RIDE_PAYMENT',
  REFUND       = 'REFUND',
  ADJUSTMENT   = 'ADJUSTMENT',
}

export enum TransactionStatus {
  SUCCESS = 'SUCCESS',
  FAILED  = 'FAILED',
}

/* ── Numeric transformer ───────────────────────────────── */

const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null ? null : parseFloat(value),
};

/* ── Entity ────────────────────────────────────────────── */

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /* ── Type & Status ── */
  @Column({
    name: 'transaction_type',
    type: 'enum',
    enum: TransactionType,
    enumName: 'transaction_type_enum',
  })
  transactionType: TransactionType;

  @Column({
    name: 'transaction_status',
    type: 'enum',
    enum: TransactionStatus,
    enumName: 'transaction_status_enum',
    default: TransactionStatus.SUCCESS,
  })
  transactionStatus: TransactionStatus;

  /* ── Amount (negative for refunds) ── */
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'TND' })
  currency: string;

  /* ── References ── */
  @Column({ name: 'ride_id', type: 'uuid', nullable: true })
  rideId: string | null;

  @Column({ name: 'trip_payment_id', type: 'uuid', nullable: true })
  tripPaymentId: string | null;

  @ManyToOne(() => TripPayment, { eager: false, nullable: true })
  @JoinColumn({ name: 'trip_payment_id' })
  tripPayment: TripPayment | null;

  @Column({ name: 'stripe_charge_id', type: 'varchar', length: 255, nullable: true, default: null })
  stripeChargeId: string | null;

  /* ── Description ── */
  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  description: string | null;

  /* ── Timestamp ── */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
