import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds status, revoked_at, and deleted_at to passkey_credentials
 * to enable soft-delete and lifecycle tracking (passkey sync fix).
 */
export class AddPasskeyLifecycleFields1795000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create enum type if not exists
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE passkey_status_enum AS ENUM ('ACTIVE', 'REVOKED', 'DELETED');
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END $$;
    `);

    // 2. Add status column with default ACTIVE
    await queryRunner.query(`
      ALTER TABLE "passkey_credentials"
      ADD COLUMN IF NOT EXISTS "status" passkey_status_enum DEFAULT 'ACTIVE';
    `);

    // 3. Add revoked_at
    await queryRunner.query(`
      ALTER TABLE "passkey_credentials"
      ADD COLUMN IF NOT EXISTS "revoked_at" timestamp DEFAULT NULL;
    `);

    // 4. Add deleted_at
    await queryRunner.query(`
      ALTER TABLE "passkey_credentials"
      ADD COLUMN IF NOT EXISTS "deleted_at" timestamp DEFAULT NULL;
    `);

    // 5. Backfill existing rows to ACTIVE
    await queryRunner.query(`
      UPDATE "passkey_credentials"
      SET "status" = 'ACTIVE'
      WHERE "status" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "passkey_credentials"
      DROP COLUMN IF EXISTS "status";
    `);
    await queryRunner.query(`
      ALTER TABLE "passkey_credentials"
      DROP COLUMN IF EXISTS "revoked_at";
    `);
    await queryRunner.query(`
      ALTER TABLE "passkey_credentials"
      DROP COLUMN IF EXISTS "deleted_at";
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS passkey_status_enum;
    `);
  }
}
