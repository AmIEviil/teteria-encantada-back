import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

describe('PublicController', () => {
  let controller: PublicController;
  const service = {
    findMenu: jest.fn().mockResolvedValue([]),
    findTables: jest.fn().mockResolvedValue([]),
    findReservations: jest.fn().mockResolvedValue([]),
    findReservationSchedule: jest.fn().mockResolvedValue([]),
    createReservation: jest.fn().mockResolvedValue({ id: 'r1' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const ref = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [
        { provide: PublicService, useValue: service },
        { provide: APP_GUARD, useValue: { canActivate: () => true } },
      ],
    }).compile();
    controller = ref.get(PublicController);
  });

  it('findMenu', async () => {
    await controller.findMenu();
    expect(service.findMenu).toHaveBeenCalled();
  });
  it('findTables', async () => {
    await controller.findTables();
    expect(service.findTables).toHaveBeenCalled();
  });
  it('findReservations', async () => {
    await controller.findReservations({} as never);
    expect(service.findReservations).toHaveBeenCalled();
  });
  it('findReservationSchedule', async () => {
    await controller.findReservationSchedule();
    expect(service.findReservationSchedule).toHaveBeenCalled();
  });
  it('createReservation', async () => {
    await controller.createReservation({} as never);
    expect(service.createReservation).toHaveBeenCalled();
  });
});
