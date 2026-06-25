import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventWorkshopAndTicketUserId1785000000000 implements MigrationInterface {
  name = 'AddEventWorkshopAndTicketUserId1785000000000';

  // Idempotente: synchronize ON pudo crear ya estas columnas.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "isWorkshop" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "workshopPoints" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_tickets" ADD COLUMN IF NOT EXISTS "userId" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "event_tickets" DROP COLUMN "userId"`);
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN "workshopPoints"`,
    );
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "isWorkshop"`);
  }
}
