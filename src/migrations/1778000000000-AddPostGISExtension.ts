import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPostGISExtension1778000000000 implements MigrationInterface {
  name = 'AddPostGISExtension1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS postgis;`);
  }
}
