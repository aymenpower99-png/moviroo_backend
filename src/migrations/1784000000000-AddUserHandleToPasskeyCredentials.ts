import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds user_handle column to passkey_credentials for auditability
 * and to ensure consistent user identity across registrations.
 */
export class AddUserHandleToPasskeyCredentials1784000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "passkey_credentials"
      ADD COLUMN IF NOT EXISTS "user_handle" text DEFAULT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "passkey_credentials" DROP COLUMN IF EXISTS "user_handle";
    `);
  }
}
