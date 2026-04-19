import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum TicketStatus {
  OPEN             = 'open',
  IN_PROGRESS      = 'in_progress',
  WAITING_FOR_USER = 'waiting_for_user',
  RESOLVED         = 'resolved',
}

export enum TicketCategory {
  ACCOUNT   = 'account',
  PAYMENT   = 'payment',
  RIDE      = 'ride',
  TECHNICAL = 'technical',
  OTHER     = 'other',
}

@Entity('support_tickets')
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: TicketStatus,
    enumName: 'ticket_status',
    default: TicketStatus.OPEN,
  })
  status: TicketStatus;

  @Column({
    type: 'enum',
    enum: TicketCategory,
    enumName: 'ticket_category',
    default: TicketCategory.OTHER,
  })
  category: TicketCategory;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @Column({ name: 'assigned_admin_id', type: 'uuid', nullable: true, default: null })
  assignedAdminId: string | null;

  @Column({ name: 'ride_id', type: 'uuid', nullable: true, default: null })
  rideId: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true, default: null })
  metadata: Record<string, any> | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true, default: null })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}