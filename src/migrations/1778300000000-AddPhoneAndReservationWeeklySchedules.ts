import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhoneAndReservationWeeklySchedules1778300000000
  implements MigrationInterface
{
  name = 'AddPhoneAndReservationWeeklySchedules1778300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "phone" character varying(25)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reservations_phone" ON "reservations" ("phone")`,
    );

    await queryRunner.query(`
      CREATE TABLE "reservation_weekly_schedules" (
        "id" uuid NOT NULL,
        "dayOfWeek" integer NOT NULL,
        "isOpen" boolean NOT NULL DEFAULT true,
        "opensAt" character varying(5),
        "closesAt" character varying(5),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_reservation_weekly_schedules_day_of_week" UNIQUE ("dayOfWeek"),
        CONSTRAINT "PK_reservation_weekly_schedules_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reservation_weekly_schedules"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reservations_phone"`);
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "phone"`);
  }
}
