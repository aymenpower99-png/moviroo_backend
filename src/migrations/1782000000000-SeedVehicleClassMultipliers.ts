import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedVehicleClassMultipliers1782000000000 implements MigrationInterface {
    name = 'SeedVehicleClassMultipliers1782000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // The entity uses @Entity('classes'), so the table name is "classes".
        // Skip seeding if the table does not exist yet (e.g. fresh DB without
        // prior sync) so this migration never blocks others.
        const tableExists = await queryRunner.query(
            `SELECT to_regclass('classes') IS NOT NULL as exists`
        );
        if (!tableExists?.[0]?.exists) {
            return;
        }

        // Also skip if the multiplier column does not exist yet
        const colExists = await queryRunner.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name = 'classes' AND column_name = 'multiplier'`
        );
        if (!colExists || colExists.length === 0) {
            return;
        }

        // Map legacy static multipliers to DB classes by normalized name
        const mapping: Record<string, number> = {
            'economy': 0.75,
            'standard': 0.90,
            'comfort': 1.00,
            'first_class': 1.60,
            'van': 1.30,
            'mini_bus': 1.50,
        };

        for (const [name, multiplier] of Object.entries(mapping)) {
            await queryRunner.query(
                `UPDATE "classes" SET "multiplier" = $1 WHERE LOWER(REPLACE(REPLACE("name", ' ', '_'), '-', '_')) = $2`,
                [multiplier, name]
            );
        }

        // Ensure any class without a multiplier gets the default 1.0
        await queryRunner.query(
            `UPDATE "classes" SET "multiplier" = 1.0 WHERE "multiplier" IS NULL`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Idempotent: only reset if the table exists
        const tableExists = await queryRunner.query(
            `SELECT to_regclass('classes') IS NOT NULL as exists`
        );
        if (!tableExists?.[0]?.exists) {
            return;
        }
        await queryRunner.query(
            `UPDATE "classes" SET "multiplier" = 1.0`
        );
    }
}
