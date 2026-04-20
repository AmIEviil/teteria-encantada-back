import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductImageAndPriceHistory1779000000000 implements MigrationInterface {
  name = 'AddProductImageAndPriceHistory1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "images" (
        "id" uuid NOT NULL,
        "image_base64" text NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_images_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`ALTER TABLE "products" ADD "image_id" uuid`);

    await queryRunner.query(`
      CREATE INDEX "IDX_products_image_id" ON "products" ("image_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD CONSTRAINT "FK_products_image_id"
      FOREIGN KEY ("image_id") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "product_price_histories" (
        "id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "previous_price" numeric(10,2) NOT NULL,
        "new_price" numeric(10,2) NOT NULL,
        "changed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_price_histories_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_product_price_histories_product_id" ON "product_price_histories" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_price_histories_changed_at" ON "product_price_histories" ("changed_at")`,
    );

    await queryRunner.query(`
      ALTER TABLE "product_price_histories"
      ADD CONSTRAINT "FK_product_price_histories_product_id"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "product_price_histories"
      ADD CONSTRAINT "FK_product_price_histories_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_price_histories" DROP CONSTRAINT "FK_product_price_histories_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_price_histories" DROP CONSTRAINT "FK_product_price_histories_product_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_price_histories_changed_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_price_histories_product_id"`,
    );
    await queryRunner.query(`DROP TABLE "product_price_histories"`);
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_products_image_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_image_id"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "image_id"`);
    await queryRunner.query(`DROP TABLE "images"`);
  }
}
