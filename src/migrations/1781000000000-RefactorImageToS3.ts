import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorImageToS31781000000000 implements MigrationInterface {
  name = 'RefactorImageToS31781000000000';

  // Idempotente. Académico: se descartan las imágenes base64 existentes
  // (roadmap §5/§6: no se migra data histórica). Se desvincula a productos
  // antes de vaciar 'images' para no chocar con la FK.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "products" SET "image_id" = NULL`);
    await queryRunner.query(`TRUNCATE TABLE "images" CASCADE`);

    await queryRunner.query(
      `ALTER TABLE "images" DROP COLUMN IF EXISTS "image_base64"`,
    );
    await queryRunner.query(
      `ALTER TABLE "images" ADD COLUMN IF NOT EXISTS "key" character varying(512) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "images" ADD COLUMN IF NOT EXISTS "url" character varying(1024) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "images" ADD COLUMN IF NOT EXISTS "mime_type" character varying(100) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "images" ADD COLUMN IF NOT EXISTS "size" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "images" DROP COLUMN IF EXISTS "size"`,
    );
    await queryRunner.query(
      `ALTER TABLE "images" DROP COLUMN IF EXISTS "mime_type"`,
    );
    await queryRunner.query(`ALTER TABLE "images" DROP COLUMN IF EXISTS "url"`);
    await queryRunner.query(`ALTER TABLE "images" DROP COLUMN IF EXISTS "key"`);
    await queryRunner.query(
      `ALTER TABLE "images" ADD COLUMN IF NOT EXISTS "image_base64" text NOT NULL DEFAULT ''`,
    );
  }
}
