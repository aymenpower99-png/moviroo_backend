import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPassengerCountToRides1786000000000 implements MigrationInterface {
  name = 'AddPassengerCountToRides1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists (may have been added by synchronize: true)
    const columnExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'rides' AND column_name = 'passenger_count'
    `);

    if (columnExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "rides"
        ADD COLUMN "passenger_count" integer NULL DEFAULT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "rides" DROP COLUMN IF EXISTS "passenger_count"
    `);
  }
}
