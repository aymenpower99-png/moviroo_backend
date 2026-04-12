import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../../users/entites/user.entity';
import { VehicleClass } from '../../../classes/entities/class.entity';
import { Vehicle } from '../../../vehicles/entities/vehicle.entity';
import { RideStatus } from '../enums/ride-status.enum';

const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null ? null : parseFloat(value),
};

@Entity('rides')
export class Ride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /* ── Relations ────────────────────────────── */

  @Column({ name: 'passenger_id', type: 'uuid' })
  passengerId: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'passenger_id' })
  passenger: User;

  @Column({ name: 'driver_id', type: 'uuid', nullable: true, default: null })
  driverId: string | null;

  @ManyToOne(() => User, { eager: false, nullable: true })
  @JoinColumn({ name: 'driver_id' })
  driver: User | null;

  @Column({ name: 'vehicle_id', type: 'uuid', nullable: true, default: null })
  vehicleId: string | null;

  @ManyToOne(() => Vehicle, { eager: false, nullable: true })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle | null;

  @Column({ name: 'class_id', type: 'uuid' })
  classId: string;

  @ManyToOne(() => VehicleClass, { eager: true })
  @JoinColumn({ name: 'class_id' })
  vehicleClass: VehicleClass;

  /* ── Status ────────────────────────────────── */

  @Column({
    type: 'enum',
    enum: RideStatus,
    enumName: 'ride_status_enum',
    default: RideStatus.PENDING,
  })
  status: RideStatus;

  /* ── Locations ─────────────────────────────── */

  @Column({ name: 'pickup_address', type: 'varchar', length: 500 })
  pickupAddress: string;

  @Column({ name: 'pickup_lat', type: 'double precision' })
  pickupLat: number;

  @Column({ name: 'pickup_lon', type: 'double precision' })
  pickupLon: number;

  @Column({ name: 'dropoff_address', type: 'varchar', length: 500 })
  dropoffAddress: string;

  @Column({ name: 'dropoff_lat', type: 'double precision' })
  dropoffLat: number;

  @Column({ name: 'dropoff_lon', type: 'double precision' })
  dropoffLon: number;

  /* ── Trip metrics ──────────────────────────── */

  @Column({ name: 'distance_km', type: 'double precision', nullable: true, default: null })
  distanceKm: number | null;

  @Column({ name: 'duration_min', type: 'double precision', nullable: true, default: null })
  durationMin: number | null;

  /* ── Pricing ───────────────────────────────── */

  @Column({
    name: 'price_estimate',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    default: null,
    transformer: numericTransformer,
  })
  priceEstimate: number | null;

  @Column({
    name: 'price_final',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    default: null,
    transformer: numericTransformer,
  })
  priceFinal: number | null;

  @Column({
    name: 'surge_multiplier',
    type: 'decimal',
    precision: 4,
    scale: 2,
    nullable: true,
    default: null,
    transformer: numericTransformer,
  })
  surgeMultiplier: number | null;

  @Column({ name: 'pricing_snapshot', type: 'jsonb', nullable: true, default: null })
  pricingSnapshot: Record<string, any> | null;

  /* ── Timestamps ────────────────────────────── */

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true, default: null })
  scheduledAt: Date | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true, default: null })
  confirmedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true, default: null })
  cancelledAt: Date | null;

  @Column({ name: 'cancellation_reason', type: 'varchar', length: 500, nullable: true, default: null })
  cancellationReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
