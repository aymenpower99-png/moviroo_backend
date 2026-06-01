import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveVehiclePhotosColumn1790000000000 implements MigrationInterface {
  name = 'RemoveVehiclePhotosColumn1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE vehicles
      DROP COLUMN IF EXISTS photos;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE vehicles
      ADD COLUMN IF NOT EXISTS photos JSONB NULL;
    `);
  }
}
