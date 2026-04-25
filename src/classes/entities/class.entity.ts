import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';

@Entity('classes')
export class VehicleClass {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ name: 'image_url', type: 'text', nullable: true, default: null })
  imageUrl: string | null;

  // ─── Features (defined by CLASS — vehicles inherit these) ────────────────
  @Column({ name: 'seats', type: 'int', default: 4 })
  seats: number;

  @Column({ name: 'bags', type: 'int', default: 2 })
  bags: number;

  @Column({ name: 'wifi', type: 'boolean', default: false })
  wifi: boolean;

  @Column({ name: 'ac', type: 'boolean', default: true })
  ac: boolean;

  @Column({ name: 'water', type: 'boolean', default: false })
  water: boolean;

  // ─── Service Features ─────────────────────────────────────────────────────
  @Column({
    name: 'free_waiting_time',
    type: 'int',
    default: 5,
    comment: 'minutes',
  })
  freeWaitingTime: number;

  @Column({ name: 'door_to_door', type: 'boolean', default: true })
  doorToDoor: boolean;

  @Column({ name: 'meet_and_greet', type: 'boolean', default: false })
  meetAndGreet: boolean;

  @Column({ name: 'extra_features', type: 'jsonb', default: [] })
  extraFeatures: { name: string; enabled: boolean }[];

  @Column({ name: 'extra_services', type: 'jsonb', default: [] })
  extraServices: { name: string; enabled: boolean }[];

  // ─── Pricing Multiplier (for ML pricing) ───────────────────────────────────
  @Column({
    name: 'multiplier',
    type: 'decimal',
    precision: 4,
    scale: 2,
    default: 1.0,
  })
  multiplier: number;

  // ─── Relation: One Class → Many Vehicles ──────────────────────────────────
  @OneToMany(() => Vehicle, (vehicle) => vehicle.vehicleClass, { lazy: true })
  vehicles: Promise<Vehicle[]>;

  // ─── Meta ─────────────────────────────────────────────────────────────────
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
