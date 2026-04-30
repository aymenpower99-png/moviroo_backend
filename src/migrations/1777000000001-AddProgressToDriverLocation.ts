import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProgressToDriverLocation1777000000001 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE driver_locations 
            ADD COLUMN progress DECIMAL(5,4);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE driver_locations 
            DROP COLUMN progress;
        `);
    }

}
