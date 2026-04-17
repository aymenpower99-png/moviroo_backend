import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ArticleStatus {
  AUTO = 'auto',
  REVIEWED = 'reviewed',
  DISABLED = 'disabled',
}

@Entity('help_articles')
export class HelpArticle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'jsonb', default: {} })
  title: Record<string, string>;  // { en: "...", fr: "...", ar: "..." }

  @Column({ type: 'jsonb', default: {} })
  description: Record<string, string>;

  @Column({ type: 'varchar', length: 50 })
  categoryKey: string;  // e.g. 'account', 'payments', 'trips', 'safety'

  @Column({ type: 'jsonb', default: {} })
  categoryLabel: Record<string, string>;  // { en: "Account", fr: "Compte", ar: "الحساب" }

  @Column({
    type: 'enum',
    enum: ArticleStatus,
    enumName: 'article_status',
    default: ArticleStatus.AUTO,
  })
  status: ArticleStatus;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
