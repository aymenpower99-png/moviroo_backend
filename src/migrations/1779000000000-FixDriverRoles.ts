import { MigrationInterface, QueryRunner } from "typeorm";

export class FixDriverRoles1779000000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Update all users who have a driver profile to have the 'driver' role
        await queryRunner.query(`
            UPDATE users
            SET role = 'driver'
            WHERE id IN (
                SELECT user_id FROM drivers
            ) AND role != 'driver';
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert: set role back to 'passenger' for drivers (optional, for rollback)
        // This is a safe rollback that won't break the system
        await queryRunner.query(`
            UPDATE users
            SET role = 'passenger'
            WHERE id IN (
                SELECT user_id FROM drivers
            ) AND role = 'driver';
        `);
    }

}
