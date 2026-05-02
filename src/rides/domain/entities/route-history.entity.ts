import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Ride } from './ride.entity';

@Entity('route_history')
export class RouteHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId: string;

  @ManyToOne(() => Ride, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ride_id' })
  ride: Ride;

  @Column({ name: 'route_geometry', type: 'text' })
  routeGeometry: string;

  @Column({ name: 'route_distance_meters', type: 'double precision' })
  routeDistanceMeters: number;

  @Column({ name: 'route_duration_seconds', type: 'double precision' })
  routeDurationSeconds: number;

  @Column({ name: 'sequence_number', type: 'int', default: 0 })
  sequenceNumber: number; // Track order of routes (1 = first, 2 = second, etc.)

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
