import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDriverLogoFields1717080000000 implements MigrationInterface {
  name = 'AddDriverLogoFields1717080000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "logo_url" text`);
    await queryRunner.query(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "logo_public_id" varchar(255)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "drivers" DROP COLUMN IF EXISTS "logo_public_id"`);
    await queryRunner.query(`ALTER TABLE "drivers" DROP COLUMN IF EXISTS "logo_url"`);
  }
}
