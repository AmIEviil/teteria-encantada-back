import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReservationComprobante1782000000000
  implements MigrationInterface
{
  name = 'AddReservationComprobante1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reservations"
      ADD COLUMN IF NOT EXISTS "comprobante_image_id" uuid
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_reservations_comprobante_image'
        ) THEN
          ALTER TABLE "reservations"
          ADD CONSTRAINT "FK_reservations_comprobante_image"
          FOREIGN KEY ("comprobante_image_id")
          REFERENCES "images"("id") ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP CONSTRAINT IF EXISTS "FK_reservations_comprobante_image"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN IF EXISTS "comprobante_image_id"`,
    );
  }
}
