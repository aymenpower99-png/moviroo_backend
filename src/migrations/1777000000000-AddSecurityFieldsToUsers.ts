import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds security-related columns to the users table:
 *  - primary_2fa_method: which 2FA method is used at login ('email' | 'totp')
 *  - passkey_enabled:    whether the user opted into device biometric (passkey) for sensitive actions
 *  - action_token_expiry: expiry of a short-lived token proving a recent re-auth (password / OTP / passkey)
 */
export class AddSecurityFieldsToUsers1777000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for primary_2fa_method
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "users_primary_2fa_method_enum" AS ENUM ('email', 'totp');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "primary_2fa_method" "users_primary_2fa_method_enum" DEFAULT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "passkey_enabled" boolean NOT NULL DEFAULT false;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "action_token_expiry" timestamptz DEFAULT NULL;
    `);

    // Back-fill primary_2fa_method for existing users with 2FA already on
    await queryRunner.query(`
      UPDATE "users"
      SET "primary_2fa_method" = 'totp'
      WHERE "totp_enabled" = true AND "primary_2fa_method" IS NULL;
    `);

    await queryRunner.query(`
      UPDATE "users"
      SET "primary_2fa_method" = 'email'
      WHERE "is_2fa_enabled" = true AND "totp_enabled" = false AND "primary_2fa_method" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "action_token_expiry";
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "passkey_enabled";
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "primary_2fa_method";
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "users_primary_2fa_method_enum";
    `);
  }
}
