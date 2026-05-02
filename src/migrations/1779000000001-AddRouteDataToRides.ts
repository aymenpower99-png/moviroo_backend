import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRouteDataToRides1779000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if columns already exist (may have been added by synchronize: true)
    const routeGeometryExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'rides'
      AND column_name = 'route_geometry';
    `);

    if (routeGeometryExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE rides
        ADD COLUMN route_geometry TEXT;
      `);
    }

    const routeDistanceExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'rides'
      AND column_name = 'route_distance_meters';
    `);

    if (routeDistanceExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE rides
        ADD COLUMN route_distance_meters DOUBLE PRECISION;
      `);
    }

    const routeDurationExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'rides'
      AND column_name = 'route_duration_seconds';
    `);

    if (routeDurationExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE rides
        ADD COLUMN route_duration_seconds DOUBLE PRECISION;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
  }
}
