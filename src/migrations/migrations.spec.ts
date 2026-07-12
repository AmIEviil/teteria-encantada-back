import type { MigrationInterface, QueryRunner } from 'typeorm';
import * as M1 from './1775822400000-AddFreeEntryAndPromoFields';
import * as M2 from './1776000000000-AddDynamicMenuForEventTickets';
import * as M3 from './1777000000000-CreateTrabajadores';
import * as M4 from './1778100000000-AddEmailToReservations';
import * as M5 from './1778300000000-AddPhoneAndReservationWeeklySchedules';
import * as M6 from './1779000000000-AddProductImageAndPriceHistory';
import * as M7 from './1780000000000-AddReservationConfirmation';
import * as M8 from './1781000000000-RefactorImageToS3';

const modules = [M1, M2, M3, M4, M5, M6, M7, M8];

const collectMigrations = (): Array<new () => MigrationInterface> => {
  const classes: Array<new () => MigrationInterface> = [];
  for (const mod of modules) {
    for (const exported of Object.values(mod)) {
      if (
        typeof exported === 'function' &&
        typeof (exported as { prototype?: { up?: unknown } }).prototype?.up ===
          'function'
      ) {
        classes.push(exported as new () => MigrationInterface);
      }
    }
  }
  return classes;
};

const makeQueryRunner = (): QueryRunner =>
  ({
    query: jest.fn().mockResolvedValue([]),
  }) as unknown as QueryRunner;

describe('Database migrations', () => {
  const migrationClasses = collectMigrations();

  it('detecta todas las migraciones', () => {
    expect(migrationClasses.length).toBe(8);
  });

  it.each(migrationClasses.map((c) => [c.name, c] as const))(
    '%s ejecuta up y down',
    async (_name, MigrationClass) => {
      const migration = new MigrationClass();
      const qr = makeQueryRunner();
      await migration.up(qr);
      await migration.down(qr);
      expect((qr.query as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    },
  );
});
