import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoyalty1786000000000 implements MigrationInterface {
  name = 'CreateLoyalty1786000000000';

  // Idempotente: synchronize ON pudo crear ya estas tablas/tipos.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loyalty_rewards_type_enum') THEN
          CREATE TYPE "loyalty_rewards_type_enum" AS ENUM ('DISCOUNT_CODE', 'FREE_WORKSHOP');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loyalty_transactions_type_enum') THEN
          CREATE TYPE "loyalty_transactions_type_enum" AS ENUM ('EARN_PURCHASE', 'EARN_ATTENDANCE', 'REDEEM');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "loyalty_config" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "attendancePointsEnabled" boolean NOT NULL DEFAULT true,
        "purchasePointsEnabled" boolean NOT NULL DEFAULT true,
        "purchasePointsRate" numeric(10,4) NOT NULL DEFAULT 0,
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_config" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "loyalty_levels" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(80) NOT NULL,
        "threshold" integer NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_levels" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "loyalty_rewards" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "levelId" uuid NOT NULL,
        "type" "loyalty_rewards_type_enum" NOT NULL,
        "description" varchar(160) NOT NULL,
        "cost" integer NOT NULL DEFAULT 0,
        "params" jsonb,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_rewards" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "loyalty_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "points" integer NOT NULL DEFAULT 0,
        "currentLevelId" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_loyalty_accounts_userId" UNIQUE ("userId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "loyalty_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "type" "loyalty_transactions_type_enum" NOT NULL,
        "points" integer NOT NULL,
        "referenceType" varchar(40),
        "referenceId" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_transactions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_loyalty_transactions_userId"
      ON "loyalty_transactions" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty_rewards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty_levels"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty_config"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "loyalty_transactions_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "loyalty_rewards_type_enum"`);
  }
}
