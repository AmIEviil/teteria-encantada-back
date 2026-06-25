import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderStatus } from './entities/order.entity';

describe('OrdersController', () => {
  let controller: OrdersController;
  const service = {
    create: jest.fn().mockResolvedValue({ id: 'o1' }),
    findAll: jest.fn().mockResolvedValue([]),
    findReport: jest.fn().mockResolvedValue({ items: [] }),
    findOne: jest.fn().mockResolvedValue({ id: 'o1' }),
    update: jest.fn().mockResolvedValue({ id: 'o1' }),
    remove: jest.fn().mockResolvedValue({ message: 'ok' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: service }],
    }).compile();
    controller = moduleRef.get(OrdersController);
  });

  it('create delega', async () => {
    await controller.create({ items: [] } as never);
    expect(service.create).toHaveBeenCalled();
  });

  it('findAll con filtros validos', async () => {
    await controller.findAll(
      '550e8400-e29b-41d4-a716-446655440000',
      OrderStatus.OPEN,
    );
    expect(service.findAll).toHaveBeenCalled();
  });

  it('findAll sin filtros', async () => {
    await controller.findAll();
    expect(service.findAll).toHaveBeenCalledWith(undefined, undefined);
  });

  it('findAll rechaza tableId no UUID', () => {
    expect(() => controller.findAll('no-uuid')).toThrow(BadRequestException);
  });

  it('findAll rechaza status invalido', () => {
    expect(() =>
      controller.findAll('550e8400-e29b-41d4-a716-446655440000', 'NOPE'),
    ).toThrow(BadRequestException);
  });

  it('findReport delega', async () => {
    await controller.findReport({});
    expect(service.findReport).toHaveBeenCalled();
  });

  it('findOne delega', async () => {
    await controller.findOne('o1');
    expect(service.findOne).toHaveBeenCalledWith('o1');
  });

  it('update delega', async () => {
    await controller.update('o1', { notes: 'x' } as never);
    expect(service.update).toHaveBeenCalledWith('o1', { notes: 'x' });
  });

  it('remove delega', async () => {
    await controller.remove('o1');
    expect(service.remove).toHaveBeenCalledWith('o1');
  });
});
