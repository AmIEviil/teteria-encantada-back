import { Test } from '@nestjs/testing';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

describe('ReservationsController', () => {
  let controller: ReservationsController;
  const service = {
    create: jest.fn().mockResolvedValue({ id: 'r1' }),
    getWeeklySchedule: jest.fn().mockResolvedValue([]),
    updateWeeklySchedule: jest.fn().mockResolvedValue([]),
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: 'r1' }),
    update: jest.fn().mockResolvedValue({ id: 'r1' }),
    remove: jest.fn().mockResolvedValue({ message: 'ok' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ReservationsController],
      providers: [{ provide: ReservationsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(ReservationsController);
  });

  it('create', async () => {
    await controller.create({} as never);
    expect(service.create).toHaveBeenCalled();
  });
  it('findSchedule', async () => {
    await controller.findSchedule();
    expect(service.getWeeklySchedule).toHaveBeenCalled();
  });
  it('updateSchedule', async () => {
    await controller.updateSchedule({} as never);
    expect(service.updateWeeklySchedule).toHaveBeenCalled();
  });
  it('findAll', async () => {
    await controller.findAll({} as never);
    expect(service.findAll).toHaveBeenCalled();
  });
  it('findOne', async () => {
    await controller.findOne('r1');
    expect(service.findOne).toHaveBeenCalledWith('r1');
  });
  it('update', async () => {
    await controller.update('r1', {} as never);
    expect(service.update).toHaveBeenCalledWith('r1', {});
  });
  it('remove', async () => {
    await controller.remove('r1');
    expect(service.remove).toHaveBeenCalledWith('r1');
  });
});
