import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProgressToDriverLocation1777000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists (may have been added by synchronize: true)
    const columnExists = await queryRunner.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'driver_locations'
            AND column_name = 'progress';
        `);

    if (columnExists.length === 0) {
      await queryRunner.query(`
                ALTER TABLE driver_locations
                ADD COLUMN progress DECIMAL(5,4);
            `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE driver_locations 
            DROP COLUMN progress;
        `);
  }
}
