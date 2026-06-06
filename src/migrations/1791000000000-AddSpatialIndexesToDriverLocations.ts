import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSpatialIndexesToDriverLocations1791000000000
  implements MigrationInterface
{
  name = 'AddSpatialIndexesToDriverLocations1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if PostGIS extension is available
    try {
      const result = await queryRunner.query(`
        SELECT 1 FROM pg_available_extensions WHERE name = 'postgis';
      `);

      if (result.length === 0) {
        console.warn(
          'PostGIS extension not available - skipping spatial index creation. Location queries will use standard distance calculations.',
        );
        return;
      }

      // Create spatial index on driver_locations for fast nearby queries
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_driver_location_spatial 
        ON driver_locations 
        USING GIST (ST_Point(longitude, latitude));
      `);

      // Create composite index for online status + last_seen_at for filtering
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_driver_location_online_last_seen 
        ON driver_locations (is_online, last_seen_at DESC);
      `);

      console.log('Spatial indexes created successfully on driver_locations table');
    } catch (error: any) {
      // PostGIS extension not available or index creation failed
      // This is optional for basic functionality - skip gracefully
      console.warn(
        'Failed to create spatial indexes - skipping. Location queries will use standard distance calculations.',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`
        DROP INDEX IF EXISTS idx_driver_location_spatial;
      `);
      await queryRunner.query(`
        DROP INDEX IF EXISTS idx_driver_location_online_last_seen;
      `);
    } catch (error: any) {
      // Ignore if indexes don't exist
    }
  }
}
