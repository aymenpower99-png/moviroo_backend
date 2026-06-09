import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHasUnreadToSupportTickets1793000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists (may have been added by synchronize: true)
    const columnExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'support_tickets' AND column_name = 'has_unread'
    `);

    if (!columnExists.length) {
      await queryRunner.query(`
        ALTER TABLE "support_tickets"
        ADD COLUMN "has_unread" boolean NOT NULL DEFAULT false
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "support_tickets"
      DROP COLUMN "has_unread"
    `);
  }
}
