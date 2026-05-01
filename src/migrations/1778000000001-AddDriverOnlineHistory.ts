import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDriverOnlineHistory1778000000001 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE driver_online_history (
                id SERIAL PRIMARY KEY,
                driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
                month VARCHAR(7) NOT NULL, -- Format: '2026-04'
                online_time_ms BIGINT NOT NULL DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(driver_id, month)
            );

            CREATE INDEX idx_driver_online_history_driver_id ON driver_online_history(driver_id);
            CREATE INDEX idx_driver_online_history_month ON driver_online_history(month);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX IF EXISTS idx_driver_online_history_month;
            DROP INDEX IF EXISTS idx_driver_online_history_driver_id;
            DROP TABLE IF EXISTS driver_online_history;
        `);
    }

}
