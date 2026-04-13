import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Ride } from '../../../rides/domain/entities/ride.entity';

const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null ? null : parseFloat(value),
};

@Entity('trip_waypoints')
@Index('idx_trip_waypoints_ride', ['rideId'])
export class TripWaypoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId: string;

  @ManyToOne(() => Ride, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ride_id' })
  ride: Ride;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numericTransformer })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: numericTransformer })
  longitude: number;

  @Column({
    name: 'speed_kmh',
    type: 'decimal',
    precision: 6,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  speedKmh: number;

  @Column({ name: 'recorded_at', type: 'timestamptz', default: () => 'NOW()' })
  recordedAt: Date;

  @Column({ type: 'int', default: 0 })
  sequence: number;
}
