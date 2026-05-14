import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReceiptUrlToTripPayment1778684648885 implements MigrationInterface {
    name = 'AddReceiptUrlToTripPayment1778684648885'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('super_admin', 'agency', 'driver', 'passenger')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::"text"::"public"."users_role_enum"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'passenger'`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."users_status_enum" RENAME TO "users_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('pending', 'active', 'blocked')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "status" TYPE "public"."users_status_enum" USING "status"::"text"::"public"."users_status_enum"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."users_provider_enum" RENAME TO "users_provider_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."users_provider_enum" AS ENUM('manual', 'google')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "provider" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "provider" TYPE "public"."users_provider_enum" USING "provider"::"text"::"public"."users_provider_enum"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "provider" SET DEFAULT 'manual'`);
        await queryRunner.query(`DROP TYPE "public"."users_provider_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."users_primary_2fa_method_enum" RENAME TO "users_primary_2fa_method_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."users_primary_2fa_method_enum" AS ENUM('email', 'totp')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "primary_2fa_method" TYPE "public"."users_primary_2fa_method_enum" USING "primary_2fa_method"::"text"::"public"."users_primary_2fa_method_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_primary_2fa_method_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_primary_2fa_method_enum_old" AS ENUM('email', 'totp')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "primary_2fa_method" TYPE "public"."users_primary_2fa_method_enum_old" USING "primary_2fa_method"::"text"::"public"."users_primary_2fa_method_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."users_primary_2fa_method_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."users_primary_2fa_method_enum_old" RENAME TO "users_primary_2fa_method_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."users_provider_enum_old" AS ENUM('manual', 'google')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "provider" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "provider" TYPE "public"."users_provider_enum_old" USING "provider"::"text"::"public"."users_provider_enum_old"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "provider" SET DEFAULT 'manual'`);
        await queryRunner.query(`DROP TYPE "public"."users_provider_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."users_provider_enum_old" RENAME TO "users_provider_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum_old" AS ENUM('pending', 'active', 'blocked')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "status" TYPE "public"."users_status_enum_old" USING "status"::"text"::"public"."users_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."users_status_enum_old" RENAME TO "users_status_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum_old" AS ENUM('super_admin', 'agency', 'driver', 'passenger')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum_old" USING "role"::"text"::"public"."users_role_enum_old"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'passenger'`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."users_role_enum_old" RENAME TO "users_role_enum"`);
    }

}
