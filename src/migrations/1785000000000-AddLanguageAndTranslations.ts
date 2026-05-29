import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLanguageAndTranslations1785000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add language column to users table
    await queryRunner.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en'
    `);

    // Add translations column to chat_messages table
    await queryRunner.query(`
      ALTER TABLE chat_messages 
      ADD COLUMN IF NOT EXISTS translations JSONB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback: remove columns
    await queryRunner.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS language
    `);

    await queryRunner.query(`
      ALTER TABLE chat_messages DROP COLUMN IF EXISTS translations
    `);
  }
}
