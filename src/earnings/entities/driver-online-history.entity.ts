import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('driver_online_history')
export class DriverOnlineHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  @Index()
  driverId: string;

  @Column({ type: 'varchar', length: 7 })
  @Index()
  month: string; // Format: '2026-04'

  @Column({ type: 'bigint', default: 0 })
  onlineTimeMs: number;

  @Column({ type: 'timestamp with time zone', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ type: 'timestamp with time zone', default: () => 'NOW()' })
  updatedAt: Date;
}
