import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDynamicMenuForEventTickets1776000000000 implements MigrationInterface {
  name = 'AddDynamicMenuForEventTickets1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE TYPE "event_ticket_menu_mode_enum" AS ENUM ('FIXED', 'CUSTOMIZABLE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "event_ticket_types" ADD COLUMN "menuMode" "event_ticket_menu_mode_enum" NOT NULL DEFAULT 'FIXED'`,
    );

    await queryRunner.query(
      'ALTER TABLE "event_ticket_types" ADD COLUMN "menuTemplate" jsonb',
    );

    await queryRunner.query(
      'ALTER TABLE "event_tickets" ADD COLUMN "menuSelection" jsonb',
    );

    await queryRunner.query(
      'ALTER TABLE "event_tickets" ADD COLUMN "menuSelectionSnapshot" jsonb',
    );

    await queryRunner.query(
      'ALTER TABLE "event_tickets" ADD COLUMN "menuExtraPrice" numeric(10,2) NOT NULL DEFAULT 0',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "event_tickets" DROP COLUMN "menuExtraPrice"',
    );

    await queryRunner.query(
      'ALTER TABLE "event_tickets" DROP COLUMN "menuSelectionSnapshot"',
    );

    await queryRunner.query(
      'ALTER TABLE "event_tickets" DROP COLUMN "menuSelection"',
    );

    await queryRunner.query(
      'ALTER TABLE "event_ticket_types" DROP COLUMN "menuTemplate"',
    );

    await queryRunner.query(
      'ALTER TABLE "event_ticket_types" DROP COLUMN "menuMode"',
    );

    await queryRunner.query(
      'DROP TYPE IF EXISTS "event_ticket_menu_mode_enum"',
    );
  }
}
