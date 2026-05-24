import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedVehicleClassMultipliers1782000000000 implements MigrationInterface {
    name = 'SeedVehicleClassMultipliers1782000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
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
                `UPDATE "vehicle_class" SET "multiplier" = $1 WHERE LOWER(REPLACE(REPLACE("name", ' ', '_'), '-', '_')) = $2`,
                [multiplier, name]
            );
        }

        // Ensure any class without a multiplier gets the default 1.0
        await queryRunner.query(
            `UPDATE "vehicle_class" SET "multiplier" = 1.0 WHERE "multiplier" IS NULL`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Reset all to default 1.0 (safe reversible operation)
        await queryRunner.query(
            `UPDATE "vehicle_class" SET "multiplier" = 1.0`
        );
    }
}
