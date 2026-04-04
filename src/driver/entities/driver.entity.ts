import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export enum DriverAvailabilityStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

export enum DriverLanguage {
  ENGLISH = 'English',
  FRENCH = 'French',
  ARABIC = 'Arabic',
}

@Entity('drivers')
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ─── Relations ────────────────────────────────────────────────────────────────

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  // ─── Driver License ───────────────────────────────────────────────────────────

  @Column({
    name: 'driver_license_number',
    type: 'varchar',
    length: 50,
    unique: true,
    nullable: true,
  })
  driverLicenseNumber: string | null;

  @Column({ name: 'driver_license_expiry', type: 'date', nullable: true })
  driverLicenseExpiry: Date | null;

  @Column({ name: 'driver_license_front_url', type: 'text', nullable: true })
  driverLicenseFrontUrl: string | null;

  @Column({ name: 'driver_license_back_url', type: 'text', nullable: true })
  driverLicenseBackUrl: string | null;

  // ─── Stats ────────────────────────────────────────────────────────────────────

  @Column({
    name: 'rating_average',
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 5.0,
  })
  ratingAverage: number;

  @Column({ name: 'total_ratings', type: 'int', default: 0 })
  totalRatings: number;

  @Column({ name: 'total_trips', type: 'int', default: 0 })
  totalTrips: number;

  // ─── Availability & Location ──────────────────────────────────────────────────

  @Column({
    name: 'availability_status',
    type: 'enum',
    enum: DriverAvailabilityStatus,
    default: DriverAvailabilityStatus.OFFLINE,
  })
  availabilityStatus: DriverAvailabilityStatus;

  @Column({
    name: 'current_latitude',
    type: 'decimal',
    precision: 10,
    scale: 8,
    nullable: true,
  })
  currentLatitude: number | null;

  @Column({
    name: 'current_longitude',
    type: 'decimal',
    precision: 11,
    scale: 8,
    nullable: true,
  })
  currentLongitude: number | null;

  @Column({ name: 'last_location_update', type: 'timestamp', nullable: true })
  lastLocationUpdate: Date | null;

  // ─── Preferences ─────────────────────────────────────────────────────────────

  @Column({
    name: 'language',
    type: 'enum',
    enum: DriverLanguage,
    nullable: true,
  })
  language: DriverLanguage | null;

  // ─── Timestamps ───────────────────────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
