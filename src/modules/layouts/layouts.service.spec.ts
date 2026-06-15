import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { LayoutsService } from './layouts.service';
import { TableLayout } from './entities/table-layout.entity';
import {
  RestaurantTable,
  TableStatus,
} from './entities/restaurant-table.entity';

type AnyRepo = Record<string, jest.Mock> & { manager?: unknown };

const UUID_B = '550e8400-e29b-41d4-a716-446655440000';

const makeQueryFailed = (code: string): QueryFailedError => {
  const err = new QueryFailedError('q', [], new Error('x'));
  (err as unknown as { driverError: { code: string } }).driverError = { code };
  return err;
};

describe('LayoutsService', () => {
  let service: LayoutsService;
  let layoutRepo: AnyRepo;
  let tableRepo: AnyRepo;
  let txLayout: AnyRepo;
  let txTable: AnyRepo;

  beforeEach(async () => {
    txLayout = {
      create: jest.fn((v) => ({ id: 'lay-1', ...v })),
      save: jest.fn((v) => Promise.resolve(v)),
      findOne: jest.fn(),
    };
    txTable = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((v) => ({ id: 'new-table', ...v })),
      save: jest.fn((v) => Promise.resolve(v)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getRepository: jest.fn((e: unknown) =>
        e === TableLayout ? txLayout : txTable,
      ),
    };
    layoutRepo = {
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ id: 'lay-1', ...v })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    layoutRepo.manager = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
    };
    tableRepo = {
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ id: 't-1', ...v })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LayoutsService,
        { provide: getRepositoryToken(TableLayout), useValue: layoutRepo },
        { provide: getRepositoryToken(RestaurantTable), useValue: tableRepo },
      ],
    }).compile();
    service = moduleRef.get(LayoutsService);
  });

  it('createLayout crea layout', async () => {
    const result = await service.createLayout({ name: 'L' } as never);
    expect(result.id).toBe('lay-1');
  });

  it('findAllLayouts', async () => {
    layoutRepo.find.mockResolvedValue([{ id: 'lay-1' }]);
    expect(await service.findAllLayouts()).toHaveLength(1);
  });

  it('findLayoutById found / not found', async () => {
    layoutRepo.findOne.mockResolvedValueOnce({ id: 'lay-1' });
    expect((await service.findLayoutById('lay-1')).id).toBe('lay-1');
    layoutRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.findLayoutById('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updateLayout', async () => {
    layoutRepo.findOne.mockResolvedValue({ id: 'lay-1', description: 'd' });
    const result = await service.updateLayout('lay-1', { name: 'N' } as never);
    expect(layoutRepo.save).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('removeLayout', async () => {
    layoutRepo.findOne.mockResolvedValue({ id: 'lay-1' });
    const result = await service.removeLayout('lay-1');
    expect(result.message).toContain('eliminado');
  });

  const snapshot = (tables: unknown[], overrides: Record<string, unknown> = {}) => ({
    name: 'Snap',
    gridSize: { rows: 5, cols: 5 },
    chairs: [{ id: 'c1', position: { x: 1, y: 2 }, rotation: 0 }],
    tables,
    ...overrides,
  });

  it('createLayoutSnapshot crea layout con mesas nuevas', async () => {
    txLayout.findOne.mockResolvedValue({ id: 'lay-1', tables: [] });
    const result = await service.createLayoutSnapshot(
      snapshot([{ code: 'T1', positionX: 0, positionY: 0 }]) as never,
    );
    expect(txTable.create).toHaveBeenCalled();
    expect(result.id).toBe('lay-1');
  });

  it('createLayoutSnapshot traduce error db', async () => {
    txLayout.save.mockRejectedValue(makeQueryFailed('23505'));
    await expect(
      service.createLayoutSnapshot(snapshot([]) as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updateLayoutSnapshot actualiza, agrega y elimina mesas', async () => {
    const existing = [
      { id: 'uuid-a', code: 'T2' },
      { id: UUID_B, code: 'T3' },
      { id: 'uuid-c', code: 'T4' },
    ];
    txLayout.findOne
      .mockResolvedValueOnce({ id: 'lay-1', tables: existing })
      .mockResolvedValueOnce({ id: 'lay-1', tables: existing });
    const result = await service.updateLayoutSnapshot(
      'lay-1',
      snapshot([
        { code: 'T1', positionX: 0, positionY: 0 }, // nueva
        { code: 'T2', positionX: 1, positionY: 1 }, // update por codigo
        { id: UUID_B, code: 'T9', positionX: 2, positionY: 2 }, // cambia codigo
      ]) as never,
    );
    expect(txTable.remove).toHaveBeenCalled(); // elimina T4
    expect(result.id).toBe('lay-1');
  });

  it('updateLayoutSnapshot lanza NotFound si no existe', async () => {
    txLayout.findOne.mockResolvedValue(null);
    await expect(
      service.updateLayoutSnapshot('x', snapshot([]) as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('snapshot rechaza codigo duplicado en payload', async () => {
    txLayout.findOne.mockResolvedValue({ id: 'lay-1', tables: [] });
    await expect(
      service.createLayoutSnapshot(
        snapshot([
          { code: 'X', positionX: 0, positionY: 0 },
          { code: 'X', positionX: 1, positionY: 1 },
        ]) as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('snapshot rechaza mesa existente duplicada', async () => {
    const existing = [{ id: UUID_B, code: 'ORIG' }];
    txLayout.findOne.mockResolvedValue({ id: 'lay-1', tables: existing });
    await expect(
      service.updateLayoutSnapshot(
        'lay-1',
        snapshot([
          { id: UUID_B, code: 'NEW1', positionX: 0, positionY: 0 },
          { code: 'ORIG', positionX: 1, positionY: 1 },
        ]) as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('snapshot rechaza id uuid inexistente', async () => {
    txLayout.findOne.mockResolvedValue({ id: 'lay-1', tables: [] });
    await expect(
      service.createLayoutSnapshot(
        snapshot([
          { id: UUID_B, code: 'Z', positionX: 0, positionY: 0 },
        ]) as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('tables', () => {
    it('createTable crea mesa', async () => {
      layoutRepo.findOne.mockResolvedValue({ id: 'lay-1' });
      const result = await service.createTable({
        layoutId: 'lay-1',
        code: 'T1',
      } as never);
      expect(result.id).toBe('t-1');
    });

    it('createTable rechaza layout inexistente', async () => {
      layoutRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createTable({ layoutId: 'x', code: 'T1' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('createTable traduce error db', async () => {
      layoutRepo.findOne.mockResolvedValue({ id: 'lay-1' });
      tableRepo.save.mockRejectedValue(makeQueryFailed('23505'));
      await expect(
        service.createTable({ layoutId: 'lay-1', code: 'T1' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('findAllTables con y sin layoutId', async () => {
      tableRepo.find.mockResolvedValue([{ id: 't-1' }]);
      expect(await service.findAllTables('lay-1')).toHaveLength(1);
      expect(await service.findAllTables()).toHaveLength(1);
    });

    it('findTableById found / not found', async () => {
      tableRepo.findOne.mockResolvedValueOnce({ id: 't-1' });
      expect((await service.findTableById('t-1')).id).toBe('t-1');
      tableRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.findTableById('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('updateTable con cambio de layout', async () => {
      tableRepo.findOne.mockResolvedValue({ id: 't-1', label: 'l' });
      layoutRepo.findOne.mockResolvedValue({ id: 'lay-2' });
      const result = await service.updateTable('t-1', {
        layoutId: 'lay-2',
        status: TableStatus.RESERVED,
      } as never);
      expect(result).toBeDefined();
    });

    it('updateTable traduce error db', async () => {
      tableRepo.findOne.mockResolvedValue({ id: 't-1' });
      tableRepo.save.mockRejectedValue(makeQueryFailed('23505'));
      await expect(
        service.updateTable('t-1', { code: 'X' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('removeTable success', async () => {
      tableRepo.findOne.mockResolvedValue({ id: 't-1' });
      const result = await service.removeTable('t-1');
      expect(result.message).toContain('eliminada');
    });

    it('removeTable traduce FK 23503', async () => {
      tableRepo.findOne.mockResolvedValue({ id: 't-1' });
      tableRepo.remove.mockRejectedValue(makeQueryFailed('23503'));
      await expect(service.removeTable('t-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('removeTable relanza error desconocido', async () => {
      tableRepo.findOne.mockResolvedValue({ id: 't-1' });
      const other = new Error('boom');
      tableRepo.remove.mockRejectedValue(other);
      await expect(service.removeTable('t-1')).rejects.toBe(other);
    });
  });
});
