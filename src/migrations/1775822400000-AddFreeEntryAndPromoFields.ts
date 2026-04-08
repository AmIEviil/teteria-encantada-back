import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFreeEntryAndPromoFields1775822400000 implements MigrationInterface {
  name = 'AddFreeEntryAndPromoFields1775822400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "events" ADD COLUMN "isFreeEntry" boolean NOT NULL DEFAULT false',
    );

    await queryRunner.query(
      'ALTER TABLE "event_ticket_types" ADD COLUMN "isPromotional" boolean NOT NULL DEFAULT false',
    );

    await queryRunner.query(
      'ALTER TABLE "event_ticket_types" ADD COLUMN "promoMinQuantity" integer',
    );

    await queryRunner.query(
      'ALTER TABLE "event_ticket_types" ADD COLUMN "promoBundlePrice" numeric(10,2)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "event_ticket_types" DROP COLUMN "promoBundlePrice"',
    );

    await queryRunner.query(
      'ALTER TABLE "event_ticket_types" DROP COLUMN "promoMinQuantity"',
    );

    await queryRunner.query(
      'ALTER TABLE "event_ticket_types" DROP COLUMN "isPromotional"',
    );

    await queryRunner.query('ALTER TABLE "events" DROP COLUMN "isFreeEntry"');
  }
}
