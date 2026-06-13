import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriverSnapshotFields1797000000000 implements MigrationInterface {
  name = 'AddDriverSnapshotFields1797000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "rides"
      ADD COLUMN IF NOT EXISTS "driver_name" varchar(200) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS "driver_phone" varchar(50) DEFAULT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "rides"
      DROP COLUMN IF EXISTS "driver_name",
      DROP COLUMN IF EXISTS "driver_phone";
    `);
  }
}
