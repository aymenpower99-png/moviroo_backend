import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('classes')
export class VehicleClass {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ name: 'image_url', type: 'text', nullable: true, default: null })
  imageUrl: string | null;

  // ─── Features ──────────────────────────────────────────────
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

  // ─── Service Features ──────────────────────────────────────
  @Column({ name: 'free_waiting_time', type: 'int', default: 5, comment: 'minutes' })
  freeWaitingTime: number;

  @Column({ name: 'door_to_door', type: 'boolean', default: true })
  doorToDoor: boolean;

  @Column({ name: 'meet_and_greet', type: 'boolean', default: false })
  meetAndGreet: boolean;

  // ─── Meta ──────────────────────────────────────────────────
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}