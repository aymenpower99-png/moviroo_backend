import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPostGISExtension1778000000000 implements MigrationInterface {
  name = 'AddPostGISExtension1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
    } catch (error: any) {
      // PostGIS extension not available on this PostgreSQL server
      // This is optional for basic functionality - skip gracefully
      console.warn(
        'PostGIS extension not available - skipping. Geospatial features will be limited.',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`DROP EXTENSION IF EXISTS postgis;`);
    } catch (error: any) {
      // Ignore if extension doesn't exist
    }
  }
}
