import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LayoutsController } from './layouts.controller';
import { TablesController } from './tables.controller';
import { LayoutsService } from './layouts.service';

const service = {
  createLayout: jest.fn().mockResolvedValue({ id: 'l' }),
  createLayoutSnapshot: jest.fn().mockResolvedValue({ id: 'l' }),
  findAllLayouts: jest.fn().mockResolvedValue([]),
  findLayoutById: jest.fn().mockResolvedValue({ id: 'l' }),
  updateLayout: jest.fn().mockResolvedValue({ id: 'l' }),
  updateLayoutSnapshot: jest.fn().mockResolvedValue({ id: 'l' }),
  removeLayout: jest.fn().mockResolvedValue({ message: 'ok' }),
  createTable: jest.fn().mockResolvedValue({ id: 't' }),
  findAllTables: jest.fn().mockResolvedValue([]),
  findTableById: jest.fn().mockResolvedValue({ id: 't' }),
  updateTable: jest.fn().mockResolvedValue({ id: 't' }),
  removeTable: jest.fn().mockResolvedValue({ message: 'ok' }),
};

describe('LayoutsController', () => {
  let controller: LayoutsController;
  beforeEach(async () => {
    jest.clearAllMocks();
    const ref = await Test.createTestingModule({
      controllers: [LayoutsController],
      providers: [{ provide: LayoutsService, useValue: service }],
    }).compile();
    controller = ref.get(LayoutsController);
  });

  it('createLayout', async () => {
    await controller.createLayout({} as never);
    expect(service.createLayout).toHaveBeenCalled();
  });
  it('createLayoutSnapshot', async () => {
    await controller.createLayoutSnapshot({} as never);
    expect(service.createLayoutSnapshot).toHaveBeenCalled();
  });
  it('findAllLayouts', async () => {
    await controller.findAllLayouts();
    expect(service.findAllLayouts).toHaveBeenCalled();
  });
  it('findLayoutById', async () => {
    await controller.findLayoutById('l');
    expect(service.findLayoutById).toHaveBeenCalledWith('l');
  });
  it('updateLayout', async () => {
    await controller.updateLayout('l', {} as never);
    expect(service.updateLayout).toHaveBeenCalledWith('l', {});
  });
  it('updateLayoutSnapshot', async () => {
    await controller.updateLayoutSnapshot('l', {} as never);
    expect(service.updateLayoutSnapshot).toHaveBeenCalledWith('l', {});
  });
  it('removeLayout', async () => {
    await controller.removeLayout('l');
    expect(service.removeLayout).toHaveBeenCalledWith('l');
  });
});

describe('TablesController', () => {
  let controller: TablesController;
  beforeEach(async () => {
    jest.clearAllMocks();
    const ref = await Test.createTestingModule({
      controllers: [TablesController],
      providers: [{ provide: LayoutsService, useValue: service }],
    }).compile();
    controller = ref.get(TablesController);
  });

  it('createTable', async () => {
    await controller.createTable({} as never);
    expect(service.createTable).toHaveBeenCalled();
  });
  it('findAllTables con uuid', async () => {
    await controller.findAllTables('550e8400-e29b-41d4-a716-446655440000');
    expect(service.findAllTables).toHaveBeenCalled();
  });
  it('findAllTables sin filtro', async () => {
    await controller.findAllTables();
    expect(service.findAllTables).toHaveBeenCalledWith(undefined);
  });
  it('findAllTables rechaza uuid invalido', () => {
    expect(() => controller.findAllTables('no')).toThrow(BadRequestException);
  });
  it('findTableById', async () => {
    await controller.findTableById('t');
    expect(service.findTableById).toHaveBeenCalledWith('t');
  });
  it('updateTable', async () => {
    await controller.updateTable('t', {} as never);
    expect(service.updateTable).toHaveBeenCalledWith('t', {});
  });
  it('removeTable', async () => {
    await controller.removeTable('t');
    expect(service.removeTable).toHaveBeenCalledWith('t');
  });
});
