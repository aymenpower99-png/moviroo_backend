import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entites/user.entity';

export enum SenderRole {
  DRIVER    = 'driver',
  PASSENGER = 'passenger',
}

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId: string;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({ name: 'sender_role', type: 'enum', enum: SenderRole })
  senderRole: SenderRole;

  @Column({ type: 'text' })
  text: string;

  @Column({ name: 'is_voice', type: 'boolean', default: false })
  isVoice: boolean;

  @Column({ name: 'is_edited', type: 'boolean', default: false })
  isEdited: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
