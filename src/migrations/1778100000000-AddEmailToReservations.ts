import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailToReservations1778100000000 implements MigrationInterface {
  name = 'AddEmailToReservations1778100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "email" character varying(160)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reservations_email" ON "reservations" (LOWER("email"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reservations_email"`);
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "email"`);
  }
}
