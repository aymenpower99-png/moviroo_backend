import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds brute-force attempt tracking columns to the users table:
 *  - otp_failed_attempts / otp_locked_until:   email OTP verification attempts
 *  - totp_failed_attempts / totp_locked_until: TOTP code verification attempts
 */
export class AddOtpAttemptTrackingToUsers1783000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "otp_failed_attempts" int NOT NULL DEFAULT 0;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "otp_locked_until" timestamptz DEFAULT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "totp_failed_attempts" int NOT NULL DEFAULT 0;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "totp_locked_until" timestamptz DEFAULT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "totp_locked_until";
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "totp_failed_attempts";
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "otp_locked_until";
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "otp_failed_attempts";
    `);
  }
}
