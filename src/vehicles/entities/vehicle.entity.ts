import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
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
  AVAILABLE   = 'Available',
  ON_TRIP     = 'On_Trip',
  MAINTENANCE = 'Maintenance',
}

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'driver_id', type: 'uuid', nullable: true, default: null })
  driverId: string | null;

  @Column({ name: 'agency_id', type: 'uuid', nullable: true, default: null })
  agencyId: string | null;

  @Column({ name: 'make', type: 'varchar', length: 50 })
  make: string;

  @Column({ name: 'model', type: 'varchar', length: 50 })
  model: string;

  @Column({ name: 'year', type: 'int' })
  year: number;

  @Column({ name: 'color', type: 'varchar', length: 30, nullable: true, default: null })
  color: string | null;

  @Column({ name: 'license_plate', type: 'varchar', length: 20, unique: true, nullable: true, default: null })
  licensePlate: string | null;

  @Column({ name: 'vin', type: 'varchar', length: 17, unique: true, nullable: true, default: null })
  vin: string | null;

  @Column({
    name: 'vehicle_type',
    type: 'enum',
    enum: VehicleType,
    enumName: 'vehicle_type',
    default: VehicleType.STANDARD,
  })
  vehicleType: VehicleType;

  @Column({ name: 'seats', type: 'int', nullable: true, default: null })
  seats: number | null;

  @Column({ name: 'registration_document_url', type: 'text', nullable: true, default: null })
  registrationDocumentUrl: string | null;

  @Column({ name: 'registration_expiry', type: 'date', nullable: true, default: null })
  registrationExpiry: Date | null;

  @Column({ name: 'insurance_document_url', type: 'text', nullable: true, default: null })
  insuranceDocumentUrl: string | null;

  @Column({ name: 'insurance_expiry', type: 'date', nullable: true, default: null })
  insuranceExpiry: Date | null;

  @Column({ name: 'technical_control_url', type: 'text', nullable: true, default: null })
  technicalControlUrl: string | null;

  @Column({ name: 'technical_control_expiry', type: 'date', nullable: true, default: null })
  technicalControlExpiry: Date | null;

  @Column({ name: 'photos', type: 'jsonb', nullable: true, default: null })
  photos: string[] | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: VehicleStatus,
    enumName: 'vehicle_status',
    default: VehicleStatus.PENDING,
  })
  status: VehicleStatus;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true, default: null })
  verifiedAt: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}