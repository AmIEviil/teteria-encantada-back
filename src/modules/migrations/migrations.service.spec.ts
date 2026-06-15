import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MigrationService } from './migrations.service';
import { MigrationAudit } from './entities/migration-audit.entity';

describe('MigrationService', () => {
  let service: MigrationService;
  let dataSource: Record<string, jest.Mock> & { migrations: unknown[]; options: unknown };
  let auditRepo: Record<string, jest.Mock>;
  let qr: Record<string, jest.Mock> & { isTransactionActive: boolean };
  let auditQb: Record<string, jest.Mock>;
  let mig1: { name: string; up: jest.Mock; down: jest.Mock };

  const setTableExists = (exists: boolean) => {
    qr.query.mockImplementation((sql: string) => {
      if (sql.includes('to_regclass')) {
        return Promise.resolve([{ regclass: exists ? 'migrations' : null }]);
      }
      if (sql.includes('SELECT "timestamp"')) {
        return Promise.resolve([{ timestamp: '1775822400000', name: 'Mig1' }]);
      }
      if (sql.includes('SELECT "name"')) {
        return Promise.resolve([{ name: 'Mig1' }]);
      }
      return Promise.resolve([]);
    });
  };

  beforeEach(async () => {
    qr = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      isTransactionActive: true,
    };
    mig1 = {
      name: 'Mig1',
      up: jest.fn().mockResolvedValue(undefined),
      down: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      migrations: [mig1, { up: jest.fn(), down: jest.fn() }],
      options: { migrationsTableName: 'migrations' },
      createQueryRunner: jest.fn(() => qr),
      runMigrations: jest.fn().mockResolvedValue([mig1]),
      undoLastMigration: jest.fn().mockResolvedValue(undefined),
    } as never;
    auditQb = {
      leftJoinAndSelect: jest.fn(() => auditQb),
      orderBy: jest.fn(() => auditQb),
      where: jest.fn(() => auditQb),
      getMany: jest.fn().mockResolvedValue([]),
    };
    auditRepo = {
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ id: 'a1', ...v })),
      createQueryBuilder: jest.fn(() => auditQb),
    };
    setTableExists(true);

    const moduleRef = await Test.createTestingModule({
      providers: [
        MigrationService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(MigrationAudit), useValue: auditRepo },
      ],
    }).compile();
    service = moduleRef.get(MigrationService);
  });

  describe('getMigrationsStatus', () => {
    it('devuelve estado asc', async () => {
      const result = await service.getMigrationsStatus('asc');
      expect(result.summary.totalMigrations).toBe(2);
      expect(result.summary.totalExecuted).toBe(1);
    });

    it('devuelve estado desc', async () => {
      const result = await service.getMigrationsStatus('desc');
      expect(result.order).toBe('desc');
    });

    it('tabla inexistente devuelve sin ejecutadas', async () => {
      setTableExists(false);
      const result = await service.getMigrationsStatus();
      expect(result.summary.totalExecuted).toBe(0);
    });
  });

  describe('executeMigration', () => {
    it('ejecuta migracion', async () => {
      const result = await service.executeMigration('Mig1', 'u1');
      expect(mig1.up).toHaveBeenCalledWith(qr);
      expect(qr.commitTransaction).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('crea tabla si no existe', async () => {
      setTableExists(false);
      await service.executeMigration('Mig1', 'u1');
      const createCall = qr.query.mock.calls.find((c) =>
        String(c[0]).includes('CREATE TABLE'),
      );
      expect(createCall).toBeDefined();
    });

    it('lanza NotFound si no existe la migracion', async () => {
      await expect(
        service.executeMigration('NoExiste', 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rollback y audita en error', async () => {
      mig1.up.mockRejectedValue(new Error('fallo'));
      await expect(
        service.executeMigration('Mig1', 'u1'),
      ).rejects.toThrow('fallo');
      expect(qr.rollbackTransaction).toHaveBeenCalled();
      const failAudit = auditRepo.save.mock.calls.find(
        (c) => c[0].success === false,
      );
      expect(failAudit).toBeDefined();
    });
  });

  describe('revertMigration', () => {
    it('revierte migracion', async () => {
      const result = await service.revertMigration('Mig1', 'u1');
      expect(mig1.down).toHaveBeenCalledWith(qr);
      expect(result.success).toBe(true);
    });

    it('lanza NotFound si no existe la migracion', async () => {
      await expect(
        service.revertMigration('NoExiste', 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza NotFound si no esta ejecutada (sin tabla)', async () => {
      setTableExists(false);
      await expect(
        service.revertMigration('Mig1', 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(qr.rollbackTransaction).toHaveBeenCalled();
    });

    it('lanza NotFound si la migracion no figura ejecutada', async () => {
      qr.query.mockImplementation((sql: string) => {
        if (sql.includes('to_regclass')) {
          return Promise.resolve([{ regclass: 'migrations' }]);
        }
        return Promise.resolve([]); // SELECT name vacio
      });
      await expect(
        service.revertMigration('Mig1', 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('bulk operations', () => {
    it('executeAllPendingMigrations', async () => {
      const result = await service.executeAllPendingMigrations();
      expect(result.executedMigrations).toContain('Mig1');
    });

    it('revertLastMigration', async () => {
      const result = await service.revertLastMigration();
      expect(result.reverted).toBe(true);
    });
  });

  describe('getMigrationHistory', () => {
    it('sin filtro', async () => {
      await service.getMigrationHistory();
      expect(auditQb.where).not.toHaveBeenCalled();
    });

    it('con filtro por nombre', async () => {
      await service.getMigrationHistory('Mig1');
      expect(auditQb.where).toHaveBeenCalled();
    });
  });
});
