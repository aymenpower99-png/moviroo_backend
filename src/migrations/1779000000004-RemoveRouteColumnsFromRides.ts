import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveRouteColumnsFromRides1779000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove route columns from rides table (moved to route_history)
    await queryRunner.query(`
      ALTER TABLE rides 
      DROP COLUMN IF EXISTS route_geometry;
    `);

    await queryRunner.query(`
      ALTER TABLE rides 
      DROP COLUMN IF EXISTS route_distance_meters;
    `);

    await queryRunner.query(`
      ALTER TABLE rides 
      DROP COLUMN IF EXISTS route_duration_seconds;
    `);

    await queryRunner.query(`
      ALTER TABLE rides 
      DROP COLUMN IF EXISTS pickup_route_geometry;
    `);

    await queryRunner.query(`
      ALTER TABLE rides 
      DROP COLUMN IF EXISTS pickup_route_distance_meters;
    `);

    await queryRunner.query(`
      ALTER TABLE rides 
      DROP COLUMN IF EXISTS pickup_route_duration_seconds;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back route columns (for rollback)
    await queryRunner.query(`
      ALTER TABLE rides 
      ADD COLUMN route_geometry TEXT;
    `);

    await queryRunner.query(`
      ALTER TABLE rides 
      ADD COLUMN route_distance_meters DOUBLE PRECISION;
    `);

    await queryRunner.query(`
      ALTER TABLE rides 
      ADD COLUMN route_duration_seconds DOUBLE PRECISION;
    `);

    await queryRunner.query(`
      ALTER TABLE rides 
      ADD COLUMN pickup_route_geometry TEXT;
    `);

    await queryRunner.query(`
      ALTER TABLE rides 
      ADD COLUMN pickup_route_distance_meters DOUBLE PRECISION;
    `);

    await queryRunner.query(`
      ALTER TABLE rides 
      ADD COLUMN pickup_route_duration_seconds DOUBLE PRECISION;
    `);
  }
}
