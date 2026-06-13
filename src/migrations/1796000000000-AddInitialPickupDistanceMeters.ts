import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds initial_pickup_distance_meters to rides table
 * to enable correct progress calculation during EN_ROUTE_TO_PICKUP phase.
 */
export class AddInitialPickupDistanceMeters1796000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "rides"
      ADD COLUMN IF NOT EXISTS "initial_pickup_distance_meters" double precision DEFAULT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "rides"
      DROP COLUMN IF EXISTS "initial_pickup_distance_meters";
    `);
  }
}
