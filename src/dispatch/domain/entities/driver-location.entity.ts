import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../../users/entites/user.entity';

const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null ? null : parseFloat(value),
};

@Entity('driver_locations')
export class DriverLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'driver_id', type: 'uuid', unique: true })
  driverId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'driver_id' })
  driver: User;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    transformer: numericTransformer,
  })
  latitude: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    transformer: numericTransformer,
  })
  longitude: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  heading: number;

  @Column({
    name: 'speed_kmh',
    type: 'decimal',
    precision: 6,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  speedKmh: number;

  @Column({ name: 'is_online', type: 'boolean', default: false })
  isOnline: boolean;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'NOW()' })
  lastSeenAt: Date;

  /** Set by HeartbeatService when the driver is forced offline due to stale heartbeat.
   *  While non-null, the heartbeat endpoint will NOT re-enable isOnline.
   *  Only the explicit goOnline endpoint clears this flag. */
  @Column({
    name: 'forced_offline_at',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  forcedOfflineAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /** Progress snapshot (0.0-1.0) computed from RoutingService.
   *  Stored in DB for quick REST access. Always computed dynamically via RoutingService.
   *  ETA is NOT stored - always computed on demand to avoid stale data. */
  @Column({
    name: 'progress',
    type: 'decimal',
    precision: 5,
    scale: 4,
    nullable: true,
    transformer: numericTransformer,
  })
  progress?: number;
}
