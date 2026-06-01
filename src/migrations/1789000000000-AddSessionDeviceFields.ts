import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionDeviceFields1789000000000 implements MigrationInterface {
  name = 'AddSessionDeviceFields1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // device_id for deduplicating sessions per device
    await queryRunner.query(`
      ALTER TABLE user_sessions
      ADD COLUMN IF NOT EXISTS device_id VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS platform VARCHAR(50) NULL,
      ADD COLUMN IF NOT EXISTS user_agent TEXT NULL;
    `);

    // Index for fast upsert lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_device
      ON user_sessions(user_id, device_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_user_sessions_user_device;
    `);
    await queryRunner.query(`
      ALTER TABLE user_sessions
      DROP COLUMN IF EXISTS device_id,
      DROP COLUMN IF NOT EXISTS platform,
      DROP COLUMN IF NOT EXISTS user_agent;
    `);
  }
}
