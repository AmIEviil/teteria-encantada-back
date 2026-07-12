import { Test } from '@nestjs/testing';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

describe('PublicController — events detail & purchase', () => {
  const publicService = {
    findMenu: jest.fn(),
    findTables: jest.fn(),
    findEvents: jest.fn(),
    findReservations: jest.fn(),
    findReservationSchedule: jest.fn(),
    createReservation: jest.fn(),
    findEvent: jest.fn().mockResolvedValue({ id: 'e1', title: 'Evento' }),
    purchase: jest
      .fn()
      .mockResolvedValue({ eventId: 'e1', total: 5000, tickets: [] }),
  };

  let controller: PublicController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [{ provide: PublicService, useValue: publicService }],
    }).compile();
    controller = moduleRef.get(PublicController);
  });

  it('GET events/:id delegates to service', async () => {
    await expect(controller.findEvent('e1')).resolves.toEqual({
      id: 'e1',
      title: 'Evento',
    });
    expect(publicService.findEvent).toHaveBeenCalledWith('e1');
  });

  it('POST events/:id/tickets delegates to service', async () => {
    const dto: any = { buyerEmail: 'a@b.cl', items: [] };
    await expect(controller.purchase('e1', dto)).resolves.toEqual({
      eventId: 'e1',
      total: 5000,
      tickets: [],
    });
    expect(publicService.purchase).toHaveBeenCalledWith('e1', dto);
  });
});
