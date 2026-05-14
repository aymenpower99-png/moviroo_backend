import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum ConsentType {
  TERMS_OF_SERVICE = 'terms_of_service',
  LOCATION_TRACKING = 'location_tracking',
  MARKETING = 'marketing',
}

@Entity('user_consents')
export class UserConsent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({
    type: 'enum',
    enum: ConsentType,
    enumName: 'consent_type_enum',
  })
  consentType: ConsentType;

  @Column({ type: 'boolean', default: false })
  granted: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
