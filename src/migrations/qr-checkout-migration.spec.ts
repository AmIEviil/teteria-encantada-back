import type { QueryRunner } from 'typeorm';
import { AddEventPurchaseQrCheckout1790000000000 } from './1790000000000-AddEventPurchaseQrCheckout';

const makeQueryRunner = () => {
  const query = jest.fn().mockResolvedValue([]);
  return { runner: { query } as unknown as QueryRunner, query };
};

describe('AddEventPurchaseQrCheckout1790000000000', () => {
  it('up es idempotente: cada sentencia tolera que la columna o el valor ya existan', async () => {
    const { runner, query } = makeQueryRunner();
    await new AddEventPurchaseQrCheckout1790000000000().up(runner);

    const statements = query.mock.calls.map((c) => String(c[0]));
    expect(statements.length).toBeGreaterThan(0);

    for (const sql of statements) {
      const isIdempotent =
        sql.includes('IF NOT EXISTS') ||
        sql.includes('IF EXISTS') ||
        // Postgres no acepta CREATE TYPE IF NOT EXISTS: la forma idempotente
        // es capturar duplicate_object en un bloque DO.
        sql.includes('EXCEPTION WHEN duplicate_object');
      expect(isIdempotent).toBe(true);
    }
  });

  it('up agrega las cuatro columnas del checkout QR', async () => {
    const { runner, query } = makeQueryRunner();
    await new AddEventPurchaseQrCheckout1790000000000().up(runner);

    const sql = query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain('"origin"');
    expect(sql).toContain('"mpPreferenceId"');
    expect(sql).toContain('"checkoutUrl"');
    expect(sql).toContain('"expiresAt"');
  });

  it('up agrega EXPIRED y CANCELLED al enum de estado', async () => {
    const { runner, query } = makeQueryRunner();
    await new AddEventPurchaseQrCheckout1790000000000().up(runner);

    const sql = query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain("'EXPIRED'");
    expect(sql).toContain("'CANCELLED'");
  });
});
