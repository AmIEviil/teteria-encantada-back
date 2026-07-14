import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PublicService } from './public.service';
import { Product } from '../products/entities/product.entity';
import { RestaurantTable } from '../layouts/entities/restaurant-table.entity';
import { ReservationsService } from '../reservations/reservations.service';
import { Event } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';

describe('PublicService', () => {
  let service: PublicService;
  let productRepo: Record<string, jest.Mock>;
  let tableRepo: Record<string, jest.Mock>;
  let eventRepo: Record<string, jest.Mock>;
  let reservationsService: Record<string, jest.Mock>;
  let eventsService: Record<string, jest.Mock>;

  beforeEach(async () => {
    productRepo = { find: jest.fn().mockResolvedValue([]) };
    tableRepo = { find: jest.fn().mockResolvedValue([]) };
    eventRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    reservationsService = {
      findAll: jest.fn().mockResolvedValue([]),
      getWeeklySchedule: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    };
    eventsService = {
      getPublicDetail: jest.fn(),
      createPublicTickets: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PublicService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(RestaurantTable), useValue: tableRepo },
        { provide: ReservationsService, useValue: reservationsService },
        { provide: getRepositoryToken(Event), useValue: eventRepo },
        { provide: EventsService, useValue: eventsService },
      ],
    }).compile();
    service = moduleRef.get(PublicService);
  });

  it('findMenu mapea productos activos', async () => {
    productRepo.find.mockResolvedValue([
      { id: 'p1', name: 'N', description: null, price: 10 },
    ]);
    const result = await service.findMenu();
    expect(result[0].id).toBe('p1');
  });

  it('findTables mapea mesas', async () => {
    tableRepo.find.mockResolvedValue([
      { id: 't1', code: 'M1', label: null, capacity: 4, status: 'AVAILABLE' },
    ]);
    const result = await service.findTables();
    expect(result[0].code).toBe('M1');
  });

  it('findReservations exige email o telefono', async () => {
    await expect(service.findReservations({} as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('findReservations mapea resultados', async () => {
    reservationsService.findAll.mockResolvedValue([
      {
        id: 'r1',
        tableId: 't1',
        table: { code: 'M1', label: 'Mesa' },
        reservedFor: new Date(),
        peopleCount: 2,
        holderName: 'Ana',
        email: 'a@x.com',
        phone: null,
        guestNames: [],
        notes: null,
        waitingUntil: null,
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ]);
    const result = await service.findReservations({
      email: 'a@x.com',
    } as never);
    expect(result[0].tableCode).toBe('M1');
  });

  it('findReservations sin tabla usa defaults', async () => {
    reservationsService.findAll.mockResolvedValue([
      {
        id: 'r1',
        tableId: 't1',
        table: null,
        reservedFor: new Date(),
        peopleCount: 2,
        holderName: null,
        email: null,
        phone: '123',
        guestNames: [],
        notes: null,
        waitingUntil: undefined,
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ]);
    const result = await service.findReservations({ phone: '123' } as never);
    expect(result[0].tableCode).toBe('');
    expect(result[0].waitingUntil).toBeNull();
  });

  it('findReservationSchedule mapea horarios', async () => {
    reservationsService.getWeeklySchedule.mockResolvedValue([
      { dayOfWeek: 1, isOpen: true, opensAt: '10:00', closesAt: '23:00' },
    ]);
    const result = await service.findReservationSchedule();
    expect(result[0].dayOfWeek).toBe(1);
  });

  it('createReservation delega y mapea', async () => {
    reservationsService.create.mockResolvedValue({
      id: 'r1',
      tableId: 't1',
      table: { code: 'M1', label: null },
      reservedFor: new Date(),
      peopleCount: 2,
      guestNames: [],
      status: 'ACTIVE',
      createdAt: new Date(),
    });
    const result = await service.createReservation({
      tableId: 't1',
    } as never);
    expect(result.id).toBe('r1');
  });

  describe('findEvents', () => {
    const publicEvent = (overrides: Record<string, unknown> = {}) => ({
      id: 'ev-1',
      title: 'Fiesta',
      description: null,
      startsAt: new Date('2026-07-01T20:00:00Z'),
      endsAt: new Date('2026-07-02T23:00:00Z'),
      isFreeEntry: false,
      totalTickets: 10,
      soldTickets: 0,
      sessions: [],
      ...overrides,
    });

    it('ordena las jornadas por fecha y hora', async () => {
      eventRepo.find.mockResolvedValue([
        publicEvent({
          sessions: [
            { date: '2026-07-02', startTime: '10:00', endTime: null },
            { date: '2026-07-01', startTime: '18:00', endTime: '20:00' },
            { date: '2026-07-01', startTime: '09:00', endTime: null },
          ],
        }),
      ]);

      const [event] = await service.findEvents();

      expect(event.schedules.map((s) => `${s.date} ${s.startTime}`)).toEqual([
        '2026-07-01 09:00',
        '2026-07-01 18:00',
        '2026-07-02 10:00',
      ]);
    });

    it('mapea evento sin jornadas', async () => {
      eventRepo.find.mockResolvedValue([publicEvent({ sessions: undefined })]);
      const [event] = await service.findEvents();
      expect(event.schedules).toEqual([]);
    });

    it('entrada liberada siempre tiene tickets disponibles', async () => {
      eventRepo.find.mockResolvedValue([
        publicEvent({ isFreeEntry: true, totalTickets: 5, soldTickets: 5 }),
      ]);
      const [event] = await service.findEvents();
      expect(event.ticketsAvailable).toBe(true);
    });

    it('totalTickets 0 se trata como cupo ilimitado', async () => {
      eventRepo.find.mockResolvedValue([
        publicEvent({ totalTickets: 0, soldTickets: 99 }),
      ]);
      const [event] = await service.findEvents();
      expect(event.ticketsAvailable).toBe(true);
    });

    it('evento agotado no tiene tickets disponibles', async () => {
      eventRepo.find.mockResolvedValue([
        publicEvent({ totalTickets: 10, soldTickets: 10 }),
      ]);
      const [event] = await service.findEvents();
      expect(event.ticketsAvailable).toBe(false);
    });
  });

  describe('eventos publicos', () => {
    it('findEvent delega en EventsService', async () => {
      eventsService.getPublicDetail.mockResolvedValue({ id: 'ev-1' });
      const result = await service.findEvent('ev-1');
      expect(eventsService.getPublicDetail).toHaveBeenCalledWith('ev-1');
      expect(result.id).toBe('ev-1');
    });

    it('purchase mapea los items al contrato de EventsService', async () => {
      eventsService.createPublicTickets.mockResolvedValue({ total: 100 });

      await service.purchase('ev-1', {
        buyerEmail: 'a@b.cl',
        items: [
          {
            ticketTypeId: 'tt-1',
            sessionId: 'ss-1',
            attendanceDate: new Date('2026-07-01'),
            attendeeFirstName: 'Ana',
            attendeeLastName: 'Diaz',
            menuSelection: { groups: [] },
          },
        ],
      } as never);

      expect(eventsService.createPublicTickets).toHaveBeenCalledWith('ev-1', {
        buyerEmail: 'a@b.cl',
        items: [
          {
            ticketTypeId: 'tt-1',
            sessionId: 'ss-1',
            attendanceDate: new Date('2026-07-01'),
            attendeeFirstName: 'Ana',
            attendeeLastName: 'Diaz',
            menuSelection: { groups: [] },
          },
        ],
      });
    });
  });
});
