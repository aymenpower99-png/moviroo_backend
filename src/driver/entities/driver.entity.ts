import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
} from 'typeorm';

export enum DriverAvailabilityStatus {
  PENDING        = 'pending',
  SETUP_REQUIRED = 'setup_required',
  OFFLINE        = 'offline',
  ONLINE         = 'online',
  ON_TRIP        = 'on_trip',
}

@Entity('drivers')
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @Column({ name: 'driver_license_number', type: 'varchar', length: 50, unique: true, nullable: true, default: null })
  driverLicenseNumber: string | null;

  @Column({ name: 'driver_license_expiry', type: 'date', nullable: true, default: null })
  driverLicenseExpiry: Date | null;

  @Column({ name: 'driver_license_front_url', type: 'text', nullable: true, default: null })
  driverLicenseFrontUrl: string | null;

  @Column({ name: 'driver_license_back_url', type: 'text', nullable: true, default: null })
  driverLicenseBackUrl: string | null;

  @Column({ name: 'rating_average', type: 'numeric', precision: 3, scale: 2, default: 5.0 })
  ratingAverage: number;

  @Column({ name: 'total_ratings', type: 'int', default: 0 })
  totalRatings: number;

  @Column({ name: 'total_trips', type: 'int', default: 0 })
  totalTrips: number;

  @Column({
    name: 'availability_status',
    type: 'enum',
    enum: DriverAvailabilityStatus,
    enumName: 'driver_availability_status',
    default: DriverAvailabilityStatus.PENDING,
  })
  availabilityStatus: DriverAvailabilityStatus;

  @Column({ name: 'work_area_id', type: 'uuid', nullable: true, default: null })
  workAreaId: string | null;

  @Column({ name: 'current_latitude', type: 'numeric', precision: 10, scale: 8, nullable: true, default: null })
  currentLatitude: number | null;

  @Column({ name: 'current_longitude', type: 'numeric', precision: 11, scale: 8, nullable: true, default: null })
  currentLongitude: number | null;

  @Column({ name: 'last_location_update', type: 'timestamp', nullable: true, default: null })
  lastLocationUpdate: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}