import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderUserId1784000000000 implements MigrationInterface {
  name = 'AddOrderUserId1784000000000';

  // Idempotente: synchronize ON pudo crear ya la columna.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "userId" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "userId"`);
  }
}
