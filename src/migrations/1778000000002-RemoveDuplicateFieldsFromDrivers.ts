import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDuplicateFieldsFromDrivers1778000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Migrate existing monthly online data to driver_online_history table
    await queryRunner.query(`
            INSERT INTO driver_online_history (driver_id, month, online_time_ms, created_at, updated_at)
            SELECT 
                user_id as driver_id,
                online_time_month as month,
                monthly_online_ms as online_time_ms,
                NOW() as created_at,
                NOW() as updated_at
            FROM drivers 
            WHERE online_time_month IS NOT NULL 
            AND monthly_online_ms > 0
            ON CONFLICT (driver_id, month) DO UPDATE SET
                online_time_ms = EXCLUDED.online_time_ms,
                updated_at = NOW();
        `);

    // Step 2: Remove location fields (duplicated in driver_locations table)
    await queryRunner.query(`
            ALTER TABLE drivers 
            DROP COLUMN IF EXISTS current_latitude,
            DROP COLUMN IF EXISTS current_longitude,
            DROP COLUMN IF EXISTS last_location_update;
        `);

    // Step 3: Remove monthly online time fields (moved to driver_online_history table)
    await queryRunner.query(`
            ALTER TABLE drivers 
            DROP COLUMN IF EXISTS monthly_online_ms,
            DROP COLUMN IF EXISTS online_time_month;
        `);

    // Step 4: Remove driver license fields (not needed in drivers table)
    await queryRunner.query(`
            ALTER TABLE drivers 
            DROP COLUMN IF EXISTS driver_license_number,
            DROP COLUMN IF EXISTS driver_license_expiry,
            DROP COLUMN IF EXISTS driver_license_front_url,
            DROP COLUMN IF EXISTS driver_license_back_url;
        `);

    // Note: online_since is KEPT in drivers table for session tracking
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back location fields
    await queryRunner.query(`
            ALTER TABLE drivers 
            ADD COLUMN IF NOT EXISTS current_latitude NUMERIC(10,8),
            ADD COLUMN IF NOT EXISTS current_longitude NUMERIC(11,8),
            ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMP;
        `);

    // Add back monthly online time fields
    await queryRunner.query(`
            ALTER TABLE drivers 
            ADD COLUMN IF NOT EXISTS monthly_online_ms BIGINT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS online_time_month VARCHAR(7);
        `);

    // Add back driver license fields
    await queryRunner.query(`
            ALTER TABLE drivers 
            ADD COLUMN IF NOT EXISTS driver_license_number VARCHAR(50) UNIQUE,
            ADD COLUMN IF NOT EXISTS driver_license_expiry DATE,
            ADD COLUMN IF NOT EXISTS driver_license_front_url TEXT,
            ADD COLUMN IF NOT EXISTS driver_license_back_url TEXT;
        `);

    // Note: online_since is kept, so no need to restore it
  }
}
