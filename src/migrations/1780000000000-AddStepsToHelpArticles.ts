import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStepsToHelpArticles1780000000000 implements MigrationInterface {
  name = 'AddStepsToHelpArticles1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Safe: ADD COLUMN IF NOT EXISTS — no-op if the column already exists
    await queryRunner.query(`
      ALTER TABLE "help_articles"
      ADD COLUMN IF NOT EXISTS "steps" JSONB NOT NULL DEFAULT '[]'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "help_articles" DROP COLUMN IF EXISTS "steps"
    `);
  }
}
