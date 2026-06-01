import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMonthlyRidesTracking1788000000000 implements MigrationInterface {
  name = 'AddMonthlyRidesTracking1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add monthly_rides column to drivers table
    await queryRunner.query(`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS monthly_rides INT NOT NULL DEFAULT 0;
    `);

    // Add current_month column to drivers table
    await queryRunner.query(`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS current_month VARCHAR(7) DEFAULT NULL;
    `);

    // Create driver_monthly_stats table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS driver_monthly_stats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_id UUID NOT NULL,
        month VARCHAR(7) NOT NULL,
        rides_count INT NOT NULL DEFAULT 0,
        tier_achieved_id UUID DEFAULT NULL,
        total_earnings DECIMAL(12,2) NOT NULL DEFAULT 0,
        total_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_driver_month UNIQUE (driver_id, month)
      );
    `);

    // Create index on driver_id for faster queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_driver_monthly_stats_driver_id 
      ON driver_monthly_stats(driver_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_driver_monthly_stats_driver_id;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS driver_monthly_stats;
    `);

    await queryRunner.query(`
      ALTER TABLE drivers DROP COLUMN IF EXISTS current_month;
    `);

    await queryRunner.query(`
      ALTER TABLE drivers DROP COLUMN IF EXISTS monthly_rides;
    `);
  }
}
