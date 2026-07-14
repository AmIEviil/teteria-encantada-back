import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrabajadorOptionalFields1789000000000
  implements MigrationInterface
{
  name = 'TrabajadorOptionalFields1789000000000';

  // Solo rut y telefono quedan obligatorios. Idempotente: synchronize ON pudo
  // haber quitado ya los NOT NULL.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trabajadores"
        ALTER COLUMN "comuna" DROP NOT NULL,
        ALTER COLUMN "direccion" DROP NOT NULL,
        ALTER COLUMN "fecha_nacimiento" DROP NOT NULL,
        ALTER COLUMN "edad" DROP NOT NULL,
        ALTER COLUMN "sueldo" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trabajadores"
        ALTER COLUMN "comuna" SET NOT NULL,
        ALTER COLUMN "direccion" SET NOT NULL,
        ALTER COLUMN "fecha_nacimiento" SET NOT NULL,
        ALTER COLUMN "edad" SET NOT NULL,
        ALTER COLUMN "sueldo" SET NOT NULL
    `);
  }
}
