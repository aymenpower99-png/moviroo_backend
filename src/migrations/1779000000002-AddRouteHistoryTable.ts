import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRouteHistoryTable1779000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists
    const tableExists = await queryRunner.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'route_history';
    `);

    if (tableExists.length === 0) {
      await queryRunner.query(`
        CREATE TABLE route_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          ride_id UUID NOT NULL,
          route_geometry TEXT NOT NULL,
          route_distance_meters DOUBLE PRECISION NOT NULL,
          route_duration_seconds DOUBLE PRECISION NOT NULL,
          sequence_number INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT fk_route_history_ride FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE
        );
      `);

      // Create index on ride_id for faster queries
      await queryRunner.query(`
        CREATE INDEX idx_route_history_ride_id ON route_history(ride_id);
      `);

      // Create index on created_at for cleanup queries
      await queryRunner.query(`
        CREATE INDEX idx_route_history_created_at ON route_history(created_at);
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_route_history_ride_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_route_history_created_at;`);
    await queryRunner.query(`DROP TABLE IF EXISTS route_history;`);
  }
}
