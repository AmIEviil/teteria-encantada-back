import { Test } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

describe('ProductsController', () => {
  let controller: ProductsController;
  const service = {
    create: jest.fn().mockResolvedValue({ id: 'p1' }),
    findAll: jest.fn().mockResolvedValue([{ id: 'p1' }]),
    findOne: jest.fn().mockResolvedValue({ id: 'p1' }),
    update: jest.fn().mockResolvedValue({ id: 'p1' }),
    remove: jest.fn().mockResolvedValue({ message: 'ok' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(ProductsController);
  });

  it('create delega en el servicio', async () => {
    await controller.create({ code: 'P1' } as never);
    expect(service.create).toHaveBeenCalledWith({ code: 'P1' });
  });

  it('findAll delega en el servicio', async () => {
    await controller.findAll();
    expect(service.findAll).toHaveBeenCalled();
  });

  it('findOne delega en el servicio', async () => {
    await controller.findOne('p1');
    expect(service.findOne).toHaveBeenCalledWith('p1');
  });

  it('update pasa el userId del request', async () => {
    await controller.update(
      'p1',
      { name: 'X' } as never,
      { user: { userId: 'u1' } } as never,
    );
    expect(service.update).toHaveBeenCalledWith('p1', { name: 'X' }, 'u1');
  });

  it('remove delega en el servicio', async () => {
    await controller.remove('p1');
    expect(service.remove).toHaveBeenCalledWith('p1');
  });
});
