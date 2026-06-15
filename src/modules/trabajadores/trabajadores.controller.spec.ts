import { Test } from '@nestjs/testing';
import { TrabajadoresController } from './trabajadores.controller';
import { TrabajadoresService } from './trabajadores.service';

describe('TrabajadoresController', () => {
  let controller: TrabajadoresController;
  const service = {
    findUsers: jest.fn().mockResolvedValue({ items: [] }),
    create: jest.fn().mockResolvedValue({ id: 'tr1' }),
    findOne: jest.fn().mockResolvedValue({ id: 'tr1' }),
    update: jest.fn().mockResolvedValue({ id: 'tr1' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const ref = await Test.createTestingModule({
      controllers: [TrabajadoresController],
      providers: [{ provide: TrabajadoresService, useValue: service }],
    }).compile();
    controller = ref.get(TrabajadoresController);
  });

  it('findUsers', async () => {
    await controller.findUsers({} as never);
    expect(service.findUsers).toHaveBeenCalled();
  });
  it('create', async () => {
    await controller.create({} as never);
    expect(service.create).toHaveBeenCalled();
  });
  it('findOne', async () => {
    await controller.findOne('tr1');
    expect(service.findOne).toHaveBeenCalledWith('tr1');
  });
  it('update', async () => {
    await controller.update('tr1', {} as never);
    expect(service.update).toHaveBeenCalledWith('tr1', {});
  });
});
