import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { User } from '../../users/entites/user.entity';
import { TicketMessage } from './ticket-message.entity';

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

  @Column({ length: 200 })
  subject: string;

  @Column('text')
  description: string;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  status: TicketStatus;

  @Column({ type: 'enum', enum: TicketCategory, default: TicketCategory.OTHER })
  category: TicketCategory;

  // who submitted the ticket (driver or passenger)
  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  // admin assigned to handle it (nullable until assigned)
  @Column({ name: 'assigned_admin_id', type: 'uuid', nullable: true, default: null })
  assignedAdminId: string | null;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_admin_id' })
  assignedAdmin: User | null;

  @OneToMany(() => TicketMessage, (m) => m.ticket, { cascade: true })
  messages: TicketMessage[];

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true, default: null })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}