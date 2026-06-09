import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateHelpArticleStatusEnum1792000000000 implements MigrationInterface {
  name = 'UpdateHelpArticleStatusEnum1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Remove default constraint from status column
    await queryRunner.query(`
      ALTER TABLE help_articles 
      ALTER COLUMN status DROP DEFAULT;
    `);

    // Step 2: Convert column to VARCHAR to remove enum constraint
    await queryRunner.query(`
      ALTER TABLE help_articles 
      ALTER COLUMN status TYPE VARCHAR(20);
    `);

    // Step 3: Update existing data to map old values to new values
    // 'reviewed' -> 'active'
    // 'auto' -> 'active' (both become published)
    // 'disabled' -> 'disabled' (stays the same)
    await queryRunner.query(`
      UPDATE help_articles 
      SET status = 'active' 
      WHERE status IN ('reviewed', 'auto');
    `);

    // Step 4: Drop the old enum type
    await queryRunner.query(`
      DROP TYPE IF EXISTS article_status;
    `);

    // Step 5: Create the new enum with only 'active' and 'disabled'
    await queryRunner.query(`
      CREATE TYPE article_status AS ENUM ('active', 'disabled');
    `);

    // Step 6: Alter the column to use the new enum
    await queryRunner.query(`
      ALTER TABLE help_articles 
      ALTER COLUMN status TYPE article_status 
      USING status::text::article_status;
    `);

    // Step 7: Set default value to 'active'
    await queryRunner.query(`
      ALTER TABLE help_articles 
      ALTER COLUMN status SET DEFAULT 'active';
    `);

    console.log('Help article status enum updated successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: change back to old enum with 'auto', 'reviewed', 'disabled'
    await queryRunner.query(`
      ALTER TABLE help_articles 
      ALTER COLUMN status TYPE VARCHAR(20);
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS article_status;
    `);

    await queryRunner.query(`
      CREATE TYPE article_status AS ENUM ('auto', 'reviewed', 'disabled');
    `);

    await queryRunner.query(`
      ALTER TABLE help_articles 
      ALTER COLUMN status TYPE article_status 
      USING status::text::article_status;
    `);

    // Note: Data mapping back is not possible without knowing original values
    // All 'active' will remain as-is (originally could have been 'reviewed' or 'auto')
  }
}
