import { Test } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

describe('EventsController', () => {
  let controller: EventsController;
  const service = {
    create: jest.fn().mockResolvedValue({ id: 'ev' }),
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: 'ev' }),
    update: jest.fn().mockResolvedValue({ id: 'ev' }),
    updateStatus: jest.fn().mockResolvedValue({ id: 'ev' }),
    remove: jest.fn().mockResolvedValue({ message: 'ok' }),
    createTicket: jest.fn().mockResolvedValue([{ id: 'tk' }]),
    findTickets: jest.fn().mockResolvedValue([]),
    updateTicket: jest.fn().mockResolvedValue({ id: 'tk' }),
    removeTicket: jest.fn().mockResolvedValue({ message: 'ok' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(EventsController);
  });

  it('create', async () => {
    await controller.create({} as never);
    expect(service.create).toHaveBeenCalled();
  });
  it('findAll', async () => {
    await controller.findAll({} as never);
    expect(service.findAll).toHaveBeenCalled();
  });
  it('findOne', async () => {
    await controller.findOne('ev');
    expect(service.findOne).toHaveBeenCalledWith('ev');
  });
  it('update', async () => {
    await controller.update('ev', {} as never);
    expect(service.update).toHaveBeenCalledWith('ev', {});
  });
  it('updateStatus', async () => {
    await controller.updateStatus('ev', {} as never);
    expect(service.updateStatus).toHaveBeenCalled();
  });
  it('remove', async () => {
    await controller.remove('ev');
    expect(service.remove).toHaveBeenCalledWith('ev');
  });
  it('createTicket', async () => {
    await controller.createTicket('ev', {} as never);
    expect(service.createTicket).toHaveBeenCalledWith('ev', {});
  });
  it('findTickets', async () => {
    await controller.findTickets('ev', {} as never);
    expect(service.findTickets).toHaveBeenCalled();
  });
  it('updateTicket', async () => {
    await controller.updateTicket('ev', 'tk', {} as never);
    expect(service.updateTicket).toHaveBeenCalledWith('ev', 'tk', {});
  });
  it('removeTicket', async () => {
    await controller.removeTicket('ev', 'tk');
    expect(service.removeTicket).toHaveBeenCalledWith('ev', 'tk');
  });
});
