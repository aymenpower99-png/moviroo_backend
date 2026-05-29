import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTierCommissionFields1787000000000 implements MigrationInterface {
  name = 'AddTierCommissionFields1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // CommissionTier.commissionRate
    await queryRunner.query(`
      ALTER TABLE commission_tiers
      ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.25;
    `);

    // Driver.currentTierId
    await queryRunner.query(`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS current_tier_id UUID DEFAULT NULL;
    `);

    // Driver.currentCommissionRate
    await queryRunner.query(`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS current_commission_rate DECIMAL(5,4) DEFAULT 0.25;
    `);

    // Ride.commissionAmount
    await queryRunner.query(`
      ALTER TABLE rides
      ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10,2) DEFAULT NULL;
    `);

    // Ride.driverEarnings
    await queryRunner.query(`
      ALTER TABLE rides
      ADD COLUMN IF NOT EXISTS driver_earnings DECIMAL(10,2) DEFAULT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commission_tiers DROP COLUMN IF EXISTS commission_rate;
    `);
    await queryRunner.query(`
      ALTER TABLE drivers DROP COLUMN IF EXISTS current_tier_id;
    `);
    await queryRunner.query(`
      ALTER TABLE drivers DROP COLUMN IF EXISTS current_commission_rate;
    `);
    await queryRunner.query(`
      ALTER TABLE rides DROP COLUMN IF EXISTS commission_amount;
    `);
    await queryRunner.query(`
      ALTER TABLE rides DROP COLUMN IF EXISTS driver_earnings;
    `);
  }
}
