import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPickupRouteDataToRides1779000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if columns already exist (may have been added by synchronize: true)
    const pickupRouteGeometryExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'rides'
      AND column_name = 'pickup_route_geometry';
    `);

    if (pickupRouteGeometryExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE rides
        ADD COLUMN pickup_route_geometry TEXT;
      `);
    }

    const pickupRouteDistanceExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'rides'
      AND column_name = 'pickup_route_distance_meters';
    `);

    if (pickupRouteDistanceExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE rides
        ADD COLUMN pickup_route_distance_meters DOUBLE PRECISION;
      `);
    }

    const pickupRouteDurationExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'rides'
      AND column_name = 'pickup_route_duration_seconds';
    `);

    if (pickupRouteDurationExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE rides
        ADD COLUMN pickup_route_duration_seconds DOUBLE PRECISION;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
}
