import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../../users/entites/user.entity';
import { Ride } from '../../../rides/domain/entities/ride.entity';
import { OfferStatus } from '../enums/offer-status.enum';

const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null ? null : parseFloat(value),
};

@Entity('dispatch_offers')
export class DispatchOffer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId: string;

  @ManyToOne(() => Ride)
  @JoinColumn({ name: 'ride_id' })
  ride: Ride;

  @Column({ name: 'driver_id', type: 'uuid' })
  driverId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'driver_id' })
  driver: User;

  @Column({ name: 'offered_at', type: 'timestamptz' })
  offeredAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({
    type: 'enum',
    enum: OfferStatus,
    enumName: 'offer_status_enum',
    default: OfferStatus.PENDING,
  })
  status: OfferStatus;

  @Column({
    name: 'rejection_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
    default: null,
  })
  rejectionReason: string | null;

  @Column({
    name: 'distance_to_pickup_km',
    type: 'decimal',
    precision: 6,
    scale: 2,
    transformer: numericTransformer,
  })
  distanceToPickupKm: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    transformer: numericTransformer,
  })
  score: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
