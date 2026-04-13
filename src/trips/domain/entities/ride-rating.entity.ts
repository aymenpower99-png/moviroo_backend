import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Ride } from '../../../rides/domain/entities/ride.entity';

@Entity('ride_ratings')
export class RideRating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ride_id', type: 'uuid', unique: true })
  rideId: string;

  @ManyToOne(() => Ride, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ride_id' })
  ride: Ride;

  @Column({ name: 'passenger_rating', type: 'smallint', nullable: true, default: null })
  passengerRating: number | null;

  @Column({ name: 'driver_rating', type: 'smallint', nullable: true, default: null })
  driverRating: number | null;

  @Column({ name: 'passenger_comment', type: 'text', nullable: true, default: null })
  passengerComment: string | null;

  @Column({ name: 'driver_comment', type: 'text', nullable: true, default: null })
  driverComment: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
