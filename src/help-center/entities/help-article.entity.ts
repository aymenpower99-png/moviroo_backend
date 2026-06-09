import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ArticleStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

/** One step in the article answer, stored as multilingual JSONB. */
export interface ArticleStep {
  order: number;
  title: Record<string, string>; // { en, fr, ar }
  description: Record<string, string>; // { en, fr, ar }
}

@Entity('help_articles')
export class HelpArticle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'jsonb', default: {} })
  title: Record<string, string>; // { en: "...", fr: "...", ar: "..." }

  @Column({ type: 'jsonb', default: {} })
  description: Record<string, string>;

  @Column({ type: 'varchar', length: 50 })
  categoryKey: string; // e.g. 'account', 'payments', 'trips', 'safety'

  @Column({ type: 'jsonb', default: {} })
  categoryLabel: Record<string, string>; // { en: "Account", fr: "Compte", ar: "الحساب" }

  @Column({
    type: 'enum',
    enum: ArticleStatus,
    enumName: 'article_status',
    default: ArticleStatus.ACTIVE,
  })
  status: ArticleStatus;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  /** Ordered answer steps. Added via migration — nullable for backward compat. */
  @Column({ type: 'jsonb', nullable: true, default: () => "'[]'" })
  steps: ArticleStep[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
