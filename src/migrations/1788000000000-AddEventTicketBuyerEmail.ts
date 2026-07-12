import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventTicketBuyerEmail1788000000000 implements MigrationInterface {
  name = 'AddEventTicketBuyerEmail1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "event_tickets" ADD COLUMN IF NOT EXISTS "buyerEmail" varchar(180)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "event_tickets" DROP COLUMN "buyerEmail"`,
    );
  }
}
