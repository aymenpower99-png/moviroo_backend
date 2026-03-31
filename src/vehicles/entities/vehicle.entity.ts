import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export enum VehicleType {
  ECONOMY     = 'Economy',
  STANDARD    = 'Standard',
  COMFORT     = 'Comfort',
  FIRST_CLASS = 'First Class',
  VAN         = 'Van',
  MINI_BUS    = 'Mini Bus',
}

export enum VehicleStatus {
  PENDING     = 'Pending',
  APPROVED    = 'Approved',
  MAINTENANCE = 'Maintenance',
  DISPONIBLE  = 'Disponible',
}

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ─── Relations ────────────────────────────────────────────────────────────

  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  driverId: string | null;

  @Column({ name: 'agency_id', type: 'uuid', nullable: true })
  agencyId: string | null;

  // ─── Car Identity ─────────────────────────────────────────────────────────

  @Column({ name: 'make', length: 50 })
  make: string;

  @Column({ name: 'model', length: 50 })
  model: string;

  @Column({ name: 'year', type: 'int' })
  year: number;

  @Column({ name: 'color', length: 30 })
  color: string;

  // ─── Registration ─────────────────────────────────────────────────────────

  @Column({ name: 'license_plate', length: 20, unique: true })
  licensePlate: string;

  @Column({
    name: 'vin',
    type: 'varchar',
    length: 17,
    unique: true,
    nullable: true,
  })
  vin: string | null;

  // ─── Vehicle Config ───────────────────────────────────────────────────────

  @Column({
    name: 'vehicle_type',
    type: 'enum',
    enum: VehicleType,
    default: VehicleType.STANDARD,
  })
  vehicleType: VehicleType;

  @Column({ name: 'seats', type: 'int', default: 4 })
  seats: number;

  // ─── Documents ────────────────────────────────────────────────────────────

  @Column({ name: 'registration_document_url', type: 'text', nullable: true })
  registrationDocumentUrl: string | null;

  @Column({ name: 'registration_expiry', type: 'date', nullable: true })
  registrationExpiry: Date | null;

  @Column({ name: 'insurance_document_url', type: 'text' })
  insuranceDocumentUrl: string;

  @Column({ name: 'insurance_expiry', type: 'date' })
  insuranceExpiry: Date;

  @Column({ name: 'technical_control_url', type: 'text', nullable: true })
  technicalControlUrl: string | null;

  @Column({ name: 'technical_control_expiry', type: 'date', nullable: true })
  technicalControlExpiry: Date | null;

  // ─── Photos ───────────────────────────────────────────────────────────────

  @Column({ name: 'photos', type: 'jsonb', nullable: true })
  photos: string[] | null;

  // ─── Status ───────────────────────────────────────────────────────────────

  @Column({
    name: 'status',
    type: 'enum',
    enum: VehicleStatus,
    default: VehicleStatus.PENDING,
  })
  status: VehicleStatus;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // ─── Timestamps ───────────────────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}