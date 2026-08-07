import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventPurchaseQrCheckout1790000000000
  implements MigrationInterface
{
  name = 'AddEventPurchaseQrCheckout1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotente: el repo corre con synchronize ON, así que estas columnas y
    // valores de enum pudieron crearse solos antes de que corra la migración.
    await queryRunner.query(
      `ALTER TYPE "event_purchases_status_enum" ADD VALUE IF NOT EXISTS 'EXPIRED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "event_purchases_status_enum" ADD VALUE IF NOT EXISTS 'CANCELLED'`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
         CREATE TYPE "event_purchases_origin_enum" AS ENUM ('PUBLIC', 'ADMIN_QR');
       EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_purchases" ADD COLUMN IF NOT EXISTS "origin" "event_purchases_origin_enum" NOT NULL DEFAULT 'PUBLIC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_purchases" ADD COLUMN IF NOT EXISTS "mpPreferenceId" varchar(80)`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_purchases" ADD COLUMN IF NOT EXISTS "checkoutUrl" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_purchases" ADD COLUMN IF NOT EXISTS "expiresAt" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Los valores de enum no se quitan: Postgres no soporta DROP VALUE y
    // revertirlos exigiría recrear el tipo con las filas ya migradas.
    await queryRunner.query(
      `ALTER TABLE "event_purchases" DROP COLUMN IF EXISTS "expiresAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_purchases" DROP COLUMN IF EXISTS "checkoutUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_purchases" DROP COLUMN IF EXISTS "mpPreferenceId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_purchases" DROP COLUMN IF EXISTS "origin"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "event_purchases_origin_enum"`,
    );
  }
}
