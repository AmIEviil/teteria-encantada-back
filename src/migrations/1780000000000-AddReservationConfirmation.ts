import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReservationConfirmation1780000000000 implements MigrationInterface {
  name = 'AddReservationConfirmation1780000000000';

  // Idempotente: el repo corre con synchronize ON por defecto, así que
  // TypeORM podría haber creado ya el tipo/columnas. Los guards evitan choques.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservations_confirmationstatus_enum') THEN
          CREATE TYPE "reservations_confirmationstatus_enum" AS ENUM
          ('NOT_SENT', 'PENDING', 'CONFIRMED', 'DECLINED', 'NO_RESPONSE');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "reservations"
      ADD COLUMN IF NOT EXISTS "confirmationStatus" "reservations_confirmationstatus_enum"
      NOT NULL DEFAULT 'NOT_SENT'
    `);
    await queryRunner.query(`
      ALTER TABLE "reservations"
      ADD COLUMN IF NOT EXISTS "confirmationSentAt" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "reservations"
      ADD COLUMN IF NOT EXISTS "confirmationRespondedAt" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_reservations_confirmation_status"
      ON "reservations" ("confirmationStatus")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_reservations_confirmation_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "confirmationRespondedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "confirmationSentAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "confirmationStatus"`,
    );
    await queryRunner.query(`DROP TYPE "reservations_confirmationstatus_enum"`);
  }
}
