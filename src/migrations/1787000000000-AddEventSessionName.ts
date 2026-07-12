import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventSessionName1787000000000 implements MigrationInterface {
  name = 'AddEventSessionName1787000000000';

  // Idempotente: synchronize ON pudo crear ya esta columna.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "event_sessions" ADD COLUMN IF NOT EXISTS "name" varchar(160)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "event_sessions" DROP COLUMN "name"`);
  }
}
