import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moves notification settings from passengers table to users table:
 *  - Adds push_notifications_enabled and email_notifications_enabled to users
 *  - Copies existing values from passengers to users
 *  - Removes the columns from passengers table
 */
export class MoveNotificationSettingsToUser1781000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add notification columns to users table
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "push_notifications_enabled" boolean NOT NULL DEFAULT true;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "email_notifications_enabled" boolean NOT NULL DEFAULT true;
    `);

    // Copy existing values from passengers to users
    await queryRunner.query(`
      UPDATE "users" u
      SET 
        "push_notifications_enabled" = COALESCE(p."push_notifications_enabled", true),
        "email_notifications_enabled" = COALESCE(p."email_notifications_enabled", true)
      FROM "passengers" p
      WHERE u.id = p."user_id"
        AND p."push_notifications_enabled" IS NOT NULL
        OR p."email_notifications_enabled" IS NOT NULL;
    `);

    // Remove notification columns from passengers table
    await queryRunner.query(`
      ALTER TABLE "passengers" DROP COLUMN IF EXISTS "push_notifications_enabled";
    `);

    await queryRunner.query(`
      ALTER TABLE "passengers" DROP COLUMN IF EXISTS "email_notifications_enabled";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add columns to passengers table
    await queryRunner.query(`
      ALTER TABLE "passengers"
      ADD COLUMN IF NOT EXISTS "push_notifications_enabled" boolean NOT NULL DEFAULT true;
    `);

    await queryRunner.query(`
      ALTER TABLE "passengers"
      ADD COLUMN IF NOT EXISTS "email_notifications_enabled" boolean NOT NULL DEFAULT true;
    `);

    // Copy values back from users to passengers
    await queryRunner.query(`
      UPDATE "passengers" p
      SET 
        "push_notifications_enabled" = u."push_notifications_enabled",
        "email_notifications_enabled" = u."email_notifications_enabled"
      FROM "users" u
      WHERE p."user_id" = u.id;
    `);

    // Remove columns from users table
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "push_notifications_enabled";
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "email_notifications_enabled";
    `);
  }
}
