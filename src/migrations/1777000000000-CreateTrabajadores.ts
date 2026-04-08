import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTrabajadores1777000000000 implements MigrationInterface {
  name = 'CreateTrabajadores1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "trabajadores" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "rut" character varying(20) NOT NULL,
        "comuna" character varying(80) NOT NULL,
        "direccion" character varying(120) NOT NULL,
        "telefono" character varying(20) NOT NULL,
        "fecha_nacimiento" date NOT NULL,
        "edad" integer NOT NULL,
        "sueldo" numeric(14,2) NOT NULL,
        "foto_url" character varying(255),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_trabajadores_user_id" UNIQUE ("user_id"),
        CONSTRAINT "UQ_trabajadores_rut" UNIQUE ("rut"),
        CONSTRAINT "PK_trabajadores_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "trabajador_documentos" (
        "id" uuid NOT NULL,
        "trabajador_id" uuid NOT NULL,
        "nombre_archivo" character varying(180) NOT NULL,
        "ruta_archivo" character varying(255) NOT NULL,
        "tipo_mime" character varying(120),
        "tamano_bytes" integer,
        "descripcion" character varying(180),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trabajador_documentos_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "trabajadores"
      ADD CONSTRAINT "FK_trabajadores_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "trabajador_documentos"
      ADD CONSTRAINT "FK_trabajador_documentos_trabajador_id"
      FOREIGN KEY ("trabajador_id") REFERENCES "trabajadores"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trabajador_documentos" DROP CONSTRAINT "FK_trabajador_documentos_trabajador_id"`);
    await queryRunner.query(`ALTER TABLE "trabajadores" DROP CONSTRAINT "FK_trabajadores_user_id"`);
    await queryRunner.query(`DROP TABLE "trabajador_documentos"`);
    await queryRunner.query(`DROP TABLE "trabajadores"`);
  }
}