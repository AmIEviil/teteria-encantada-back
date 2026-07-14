import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { Event, EventStatus } from './entities/event.entity';
import {
  EventTicketMenuMode,
  EventTicketType,
} from './entities/event-ticket-type.entity';
import { EventTicket, EventTicketStatus } from './entities/event-ticket.entity';
import { EventTicketTypeDailyStock } from './entities/event-ticket-type-daily-stock.entity';
import { EventSession } from './entities/event-session.entity';
import { EventSessionTicketAllocation } from './entities/event-session-ticket-allocation.entity';

type AnyRepo = Record<string, jest.Mock> & { manager?: unknown };

const START = new Date('2026-07-01T20:00:00Z');
const END = new Date('2026-07-03T23:00:00Z');

const makeTicketTypeDto = (overrides: Record<string, unknown> = {}) => ({
  name: 'General',
  price: 100,
  totalStock: 50,
  ...overrides,
});

const customizableTemplate = () => ({
  menuMode: EventTicketMenuMode.CUSTOMIZABLE,
  menuTemplate: {
    groups: [
      {
        key: 'plato',
        label: 'Plato',
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          { id: 'carne', label: 'Carne', extraPrice: 0 },
          { id: 'pollo', label: 'Pollo', extraPrice: 10 },
        ],
      },
    ],
  },
});

const buildEvent = (overrides: Partial<Event> = {}): Event =>
  ({
    id: 'ev-1',
    title: 'Fiesta',
    description: 'desc',
    startsAt: START,
    endsAt: END,
    status: EventStatus.ENABLED,
    totalTickets: 100,
    soldTickets: 0,
    isFreeEntry: false,
    ticketTypes: [],
    ...overrides,
  }) as Event;

const buildTicketType = (
  overrides: Partial<EventTicketType> = {},
): EventTicketType =>
  ({
    id: 'tt-1',
    eventId: 'ev-1',
    name: 'General',
    price: 100,
    includesDetails: 'Incluye bebida',
    menuMode: EventTicketMenuMode.FIXED,
    menuTemplate: null,
    totalStock: 50,
    dailyStocks: [],
    isPromotional: false,
    promoMinQuantity: null,
    promoBundlePrice: null,
    ...overrides,
  }) as EventTicketType;

const buildSession = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'ss-1',
  eventId: 'ev-1',
  date: '2026-07-01',
  startTime: '12:00',
  endTime: null,
  capacity: 10,
  allocations: [],
  ...overrides,
});

describe('EventsService', () => {
  let service: EventsService;
  let eventRepo: AnyRepo;
  let ticketTypeRepo: AnyRepo;
  let dailyStockRepo: AnyRepo;
  let ticketRepo: AnyRepo;
  let txEvent: AnyRepo;
  let txTicketType: AnyRepo;
  let txSession: AnyRepo;
  let txAllocation: AnyRepo;
  let ticketQb: Record<string, jest.Mock>;
  let eventQb: Record<string, jest.Mock>;
  let loyaltyServiceMock: { earnAttendance: jest.Mock };

  beforeEach(async () => {
    loyaltyServiceMock = {
      earnAttendance: jest.fn().mockResolvedValue(undefined),
    };
    ticketQb = {
      leftJoinAndSelect: jest.fn(() => ticketQb),
      where: jest.fn(() => ticketQb),
      andWhere: jest.fn(() => ticketQb),
      orderBy: jest.fn(() => ticketQb),
      addOrderBy: jest.fn(() => ticketQb),
      getCount: jest.fn().mockResolvedValue(0),
      getMany: jest.fn().mockResolvedValue([]),
    };
    eventQb = {
      leftJoinAndSelect: jest.fn(() => eventQb),
      where: jest.fn(() => eventQb),
      andWhere: jest.fn(() => eventQb),
      orderBy: jest.fn(() => eventQb),
      addOrderBy: jest.fn(() => eventQb),
      getMany: jest.fn().mockResolvedValue([]),
    };

    txEvent = {
      create: jest.fn((v) => ({ id: 'ev-1', ...v })),
      save: jest.fn((v) => Promise.resolve({ id: 'ev-1', ...v })),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    txTicketType = {
      create: jest.fn((v) => v),
      save: jest.fn((v: unknown) =>
        Promise.resolve(
          Array.isArray(v)
            ? v.map((item, index) => ({ id: `tt-${index + 1}`, ...item }))
            : v,
        ),
      ),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    txSession = {
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(v)),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    txAllocation = {
      create: jest.fn((v) => v),
    };
    const entityManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Event) return txEvent;
        if (entity === EventSession) return txSession;
        if (entity === EventSessionTicketAllocation) return txAllocation;
        return txTicketType;
      }),
    };

    eventRepo = {
      findOne: jest.fn(),
      save: jest.fn((v) => Promise.resolve(v)),
      remove: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => eventQb),
    };
    eventRepo.manager = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(entityManager)),
    };
    ticketTypeRepo = { create: jest.fn((v) => v), save: jest.fn() };
    dailyStockRepo = { create: jest.fn((v) => v) };
    ticketRepo = {
      countBy: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(Array.isArray(v) ? v : v)),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => ticketQb),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: eventRepo },
        {
          provide: getRepositoryToken(EventTicketType),
          useValue: ticketTypeRepo,
        },
        {
          provide: getRepositoryToken(EventTicketTypeDailyStock),
          useValue: dailyStockRepo,
        },
        { provide: getRepositoryToken(EventTicket), useValue: ticketRepo },
        { provide: LoyaltyService, useValue: loyaltyServiceMock },
      ],
    }).compile();

    service = moduleRef.get(EventsService);
  });

  describe('create', () => {
    it('rechaza fechas invalidas', async () => {
      await expect(
        service.create({ title: 'X', startsAt: END, endsAt: START } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza evento de pago sin tipos de ticket', async () => {
      await expect(
        service.create({
          title: 'X',
          startsAt: START,
          endsAt: END,
          isFreeEntry: false,
          ticketTypes: [],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('crea evento de entrada liberada', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent({ isFreeEntry: true }));
      const result = await service.create({
        title: 'Libre',
        startsAt: START,
        endsAt: END,
        isFreeEntry: true,
      } as never);
      expect(result.isFreeEntry).toBe(true);
    });

    it('crea evento con tipo de ticket y cupos diarios', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent());
      const result = await service.create({
        title: 'Pago',
        startsAt: START,
        endsAt: END,
        ticketTypes: [
          makeTicketTypeDto({
            totalStock: 50,
            dailyStocks: [
              { date: new Date('2026-07-01'), quantity: 20 },
              { date: new Date('2026-07-02'), quantity: 20 },
            ],
          }),
        ],
      } as never);
      expect(txTicketType.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('crea ticket con menu personalizable', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent());
      await service.create({
        title: 'Menu',
        startsAt: START,
        endsAt: END,
        ticketTypes: [makeTicketTypeDto(customizableTemplate())],
      } as never);
      expect(txTicketType.save).toHaveBeenCalled();
    });

    it('crea ticket promocional valido', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent());
      await service.create({
        title: 'Promo',
        startsAt: START,
        endsAt: END,
        ticketTypes: [
          makeTicketTypeDto({
            isPromotional: true,
            promoMinQuantity: 2,
            promoBundlePrice: 150,
          }),
        ],
      } as never);
      expect(txTicketType.save).toHaveBeenCalled();
    });

    it('persiste customTicketTemplateUrl del ticket type', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent());
      await service.create({
        title: 'Evento',
        startsAt: START,
        endsAt: END,
        ticketTypes: [
          makeTicketTypeDto({
            name: 'VIP',
            customTicketTemplateUrl: 'https://s3/tpl.png',
          }),
        ],
      } as never);

      expect(txTicketType.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customTicketTemplateUrl: 'https://s3/tpl.png',
        }),
      );
    });

    it.each([
      ['nombres duplicados', [makeTicketTypeDto(), makeTicketTypeDto()]],
      [
        'sin cupo total ni diario',
        [makeTicketTypeDto({ totalStock: undefined, dailyStocks: [] })],
      ],
      [
        'promocion invalida',
        [
          makeTicketTypeDto({
            isPromotional: true,
            promoMinQuantity: 2,
            promoBundlePrice: 250,
          }),
        ],
      ],
      [
        'fechas duplicadas en cupos',
        [
          makeTicketTypeDto({
            dailyStocks: [
              { date: new Date('2026-07-01'), quantity: 5 },
              { date: new Date('2026-07-01'), quantity: 5 },
            ],
          }),
        ],
      ],
      [
        'fecha fuera de rango',
        [
          makeTicketTypeDto({
            dailyStocks: [{ date: new Date('2026-08-01'), quantity: 5 }],
          }),
        ],
      ],
      [
        'diario supera total',
        [
          makeTicketTypeDto({
            totalStock: 5,
            dailyStocks: [{ date: new Date('2026-07-01'), quantity: 50 }],
          }),
        ],
      ],
      [
        'menu fijo con plantilla',
        [
          makeTicketTypeDto({
            menuMode: EventTicketMenuMode.FIXED,
            menuTemplate: { groups: [] },
          }),
        ],
      ],
      [
        'menu personalizable sin grupos',
        [
          makeTicketTypeDto({
            menuMode: EventTicketMenuMode.CUSTOMIZABLE,
            menuTemplate: { groups: [] },
          }),
        ],
      ],
      [
        'grupo sin clave',
        [
          makeTicketTypeDto({
            menuMode: EventTicketMenuMode.CUSTOMIZABLE,
            menuTemplate: {
              groups: [{ label: 'X', options: [{ id: 'a', label: 'A' }] }],
            },
          }),
        ],
      ],
      [
        'grupo sin opciones',
        [
          makeTicketTypeDto({
            menuMode: EventTicketMenuMode.CUSTOMIZABLE,
            menuTemplate: {
              groups: [{ key: 'g', label: 'G', options: [] }],
            },
          }),
        ],
      ],
      [
        'opcion sin id',
        [
          makeTicketTypeDto({
            menuMode: EventTicketMenuMode.CUSTOMIZABLE,
            menuTemplate: {
              groups: [{ key: 'g', label: 'G', options: [{ label: 'A' }] }],
            },
          }),
        ],
      ],
      [
        'opcion con recargo negativo',
        [
          makeTicketTypeDto({
            menuMode: EventTicketMenuMode.CUSTOMIZABLE,
            menuTemplate: {
              groups: [
                {
                  key: 'g',
                  label: 'G',
                  options: [{ id: 'a', label: 'A', extraPrice: -5 }],
                },
              ],
            },
          }),
        ],
      ],
    ])('rechaza %s', async (_label, ticketTypes) => {
      await expect(
        service.create({
          title: 'X',
          startsAt: START,
          endsAt: END,
          ticketTypes,
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('crea evento con jornadas y calcula totalTickets por capacidades', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent({ hasSessions: true }));
      await service.create({
        title: 'Jornadas',
        startsAt: START,
        endsAt: END,
        hasSessions: true,
        ticketTypes: [makeTicketTypeDto({ totalStock: undefined })],
        sessions: [
          {
            date: new Date('2026-07-01'),
            startTime: '12:00',
            capacity: 30,
            allocations: [{ ticketTypeIndex: 0, quantity: 10 }],
          },
          { date: new Date('2026-07-02'), startTime: '16:00', capacity: 20 },
        ],
      } as never);

      expect(txSession.save).toHaveBeenCalled();
      const savedEvent = txEvent.create.mock.calls[0][0];
      expect(savedEvent.totalTickets).toBe(50);
      expect(savedEvent.hasSessions).toBe(true);

      const savedSessions = txSession.save.mock.calls[0][0];
      expect(savedSessions[0]).toMatchObject({
        date: '2026-07-01',
        startTime: '12:00',
        capacity: 30,
        allocations: [{ ticketTypeId: 'tt-1', quantity: 10 }],
      });
      expect(savedSessions[1]).toMatchObject({
        allocations: [],
        endTime: null,
      });
    });

    it('rechaza jornadas con suma de cupos mayor a la capacidad', async () => {
      await expect(
        service.create({
          title: 'Jornadas',
          startsAt: START,
          endsAt: END,
          hasSessions: true,
          ticketTypes: [makeTicketTypeDto({ totalStock: undefined })],
          sessions: [
            {
              date: new Date('2026-07-01'),
              startTime: '12:00',
              capacity: 10,
              allocations: [{ ticketTypeIndex: 0, quantity: 11 }],
            },
          ],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza jornadas duplicadas (misma fecha y hora)', async () => {
      await expect(
        service.create({
          title: 'Jornadas',
          startsAt: START,
          endsAt: END,
          hasSessions: true,
          ticketTypes: [makeTicketTypeDto({ totalStock: undefined })],
          sessions: [
            { date: new Date('2026-07-01'), startTime: '12:00', capacity: 10 },
            { date: new Date('2026-07-01'), startTime: '12:00', capacity: 20 },
          ],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza jornada fuera del rango del evento', async () => {
      await expect(
        service.create({
          title: 'Jornadas',
          startsAt: START,
          endsAt: END,
          hasSessions: true,
          ticketTypes: [makeTicketTypeDto({ totalStock: undefined })],
          sessions: [
            { date: new Date('2026-07-20'), startTime: '12:00', capacity: 10 },
          ],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza dailyStocks cuando el evento usa jornadas', async () => {
      await expect(
        service.create({
          title: 'Jornadas',
          startsAt: START,
          endsAt: END,
          hasSessions: true,
          ticketTypes: [
            makeTicketTypeDto({
              totalStock: undefined,
              dailyStocks: [{ date: new Date('2026-07-01'), quantity: 5 }],
            }),
          ],
          sessions: [
            { date: new Date('2026-07-01'), startTime: '12:00', capacity: 10 },
          ],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza allocation con ticketTypeIndex inexistente', async () => {
      await expect(
        service.create({
          title: 'Jornadas',
          startsAt: START,
          endsAt: END,
          hasSessions: true,
          ticketTypes: [makeTicketTypeDto({ totalStock: undefined })],
          sessions: [
            {
              date: new Date('2026-07-01'),
              startTime: '12:00',
              capacity: 10,
              allocations: [{ ticketTypeIndex: 5, quantity: 5 }],
            },
          ],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('aplica filtros', async () => {
      eventQb.getMany.mockResolvedValue([buildEvent()]);
      const result = await service.findAll({
        status: EventStatus.ENABLED,
        search: ' fiesta ',
        startDate: START,
        endDate: END,
      } as never);
      expect(result).toHaveLength(1);
    });

    it('sin filtros', async () => {
      await service.findAll({} as never);
      expect(eventRepo.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('devuelve evento', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent());
      expect((await service.findOne('ev-1')).id).toBe('ev-1');
    });
    it('lanza NotFound', async () => {
      eventRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('rechaza entrada liberada con tipos de ticket', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent({ isFreeEntry: false }));
      await expect(
        service.update('ev-1', {
          isFreeEntry: true,
          ticketTypes: [makeTicketTypeDto()],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza desactivar libre sin tipos de ticket', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent({ isFreeEntry: true }));
      await expect(
        service.update('ev-1', { isFreeEntry: false } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza modificar tipos con tickets existentes', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent());
      ticketRepo.countBy.mockResolvedValue(3);
      await expect(
        service.update('ev-1', {
          ticketTypes: [makeTicketTypeDto()],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('actualiza campos basicos', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent());
      const result = await service.update('ev-1', {
        title: ' Nuevo ',
        description: 'd',
        officialImageUrl: 'http://img',
        status: EventStatus.SUSPENDED,
      } as never);
      expect(result).toBeDefined();
      expect(txEvent.save).toHaveBeenCalled();
    });

    it('cambia a entrada liberada y borra tipos', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent({ isFreeEntry: false }));
      await service.update('ev-1', { isFreeEntry: true } as never);
      expect(txTicketType.delete).toHaveBeenCalled();
    });

    it('recrea tipos de ticket', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent());
      ticketRepo.countBy.mockResolvedValue(0);
      await service.update('ev-1', {
        ticketTypes: [makeTicketTypeDto()],
      } as never);
      expect(txTicketType.save).toHaveBeenCalled();
    });

    it('rechaza cambiar a modo jornadas sin enviar tipos de ticket', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent({ hasSessions: false }));
      await expect(
        service.update('ev-1', { hasSessions: true } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza salir de modo jornadas sin enviar tipos de ticket', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent({ hasSessions: true }));
      await expect(
        service.update('ev-1', { hasSessions: false } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cambia de jornadas a tipos simples, borra sesiones y recalcula totalTickets', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent({ hasSessions: true }));
      ticketRepo.countBy.mockResolvedValue(0);
      const result = await service.update('ev-1', {
        hasSessions: false,
        ticketTypes: [makeTicketTypeDto({ totalStock: 40 })],
      } as never);

      expect(result).toBeDefined();
      expect(txSession.delete).toHaveBeenCalledWith({ eventId: 'ev-1' });
      const savedEvent = txEvent.save.mock.calls[0][0];
      expect(savedEvent.totalTickets).toBe(40);
    });

    it('rechaza enviar jornadas sin tipos de ticket', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent({ hasSessions: true }));
      await expect(
        service.update('ev-1', {
          sessions: [
            { date: new Date('2026-07-01'), startTime: '12:00', capacity: 10 },
          ],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza enviar tipos de ticket sin jornadas cuando el evento ya usa jornadas', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent({ hasSessions: true }));
      await expect(
        service.update('ev-1', {
          hasSessions: true,
          ticketTypes: [makeTicketTypeDto({ totalStock: undefined })],
        } as never),
      ).rejects.toThrow(
        'Debes enviar las jornadas del evento junto a los tipos de ticket',
      );
    });

    it('cambia a modo jornadas con tipos y jornadas nuevas, borra y recrea sesiones', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent({ hasSessions: false }));
      ticketRepo.countBy.mockResolvedValue(0);
      const result = await service.update('ev-1', {
        hasSessions: true,
        ticketTypes: [makeTicketTypeDto({ totalStock: undefined })],
        sessions: [
          {
            date: new Date('2026-07-01'),
            startTime: '12:00',
            capacity: 30,
            allocations: [{ ticketTypeIndex: 0, quantity: 10 }],
          },
          { date: new Date('2026-07-02'), startTime: '16:00', capacity: 20 },
        ],
      } as never);

      expect(result).toBeDefined();
      expect(txSession.delete).toHaveBeenCalledWith({ eventId: 'ev-1' });
      expect(txSession.save).toHaveBeenCalled();
      const savedEvent = txEvent.save.mock.calls[0][0];
      expect(savedEvent.totalTickets).toBe(50);
    });

    it('rechaza actualizar jornadas si el evento ya tiene tickets', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent({ hasSessions: false }));
      ticketRepo.countBy.mockResolvedValue(1);
      await expect(
        service.update('ev-1', {
          hasSessions: true,
          ticketTypes: [makeTicketTypeDto({ totalStock: undefined })],
          sessions: [
            { date: new Date('2026-07-01'), startTime: '12:00', capacity: 10 },
          ],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateStatus', () => {
    it('actualiza estado', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent());
      const result = await service.updateStatus('ev-1', {
        status: EventStatus.SUSPENDED,
      } as never);
      expect(eventRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('proximamente', () => {
    const comingSoonDto = (publishAt?: Date) => ({
      title: 'Proximo',
      startsAt: START,
      endsAt: END,
      status: EventStatus.COMING_SOON,
      publishAt,
      ticketTypes: [makeTicketTypeDto()],
    });

    it('exige fecha de publicacion al crear', async () => {
      await expect(
        service.create(comingSoonDto() as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza publicacion posterior al inicio del evento', async () => {
      await expect(
        service.create(
          comingSoonDto(new Date('2026-07-02T20:00:00Z')) as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('guarda publishAt cuando es valido', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ status: EventStatus.COMING_SOON }),
      );

      await service.create(
        comingSoonDto(new Date('2026-06-20T10:00:00Z')) as never,
      );

      expect(txEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EventStatus.COMING_SOON,
          publishAt: new Date('2026-06-20T10:00:00Z'),
        }),
      );
    });

    it('limpia publishAt en estados distintos de COMING_SOON', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          status: EventStatus.COMING_SOON,
          publishAt: new Date('2026-06-20T10:00:00Z'),
        }),
      );

      const result = await service.updateStatus('ev-1', {
        status: EventStatus.ENABLED,
      } as never);

      expect(result.publishAt).toBeNull();
    });

    it('el cron habilita los eventos cuya publicacion ya vencio', async () => {
      await service.publishScheduledEvents();

      expect(eventRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: EventStatus.COMING_SOON }),
        { status: EventStatus.ENABLED, publishAt: null },
      );
    });
  });

  describe('remove', () => {
    it('elimina evento sin tickets', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent());
      ticketRepo.countBy.mockResolvedValue(0);
      const result = await service.remove('ev-1');
      expect(result.message).toContain('eliminado');
    });

    it('rechaza si hay tickets', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent());
      ticketRepo.countBy.mockResolvedValue(2);
      await expect(service.remove('ev-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('createTicket', () => {
    const dto = (overrides: Record<string, unknown> = {}) => ({
      ticketTypeId: 'tt-1',
      attendeeFirstName: 'Ana',
      attendeeLastName: 'Paz',
      attendanceDate: '2026-07-02',
      ...overrides,
    });

    it('rechaza evento no habilitado', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ status: EventStatus.SUSPENDED }),
      );
      await expect(
        service.createTicket('ev-1', dto() as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza evento de entrada liberada', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent({ isFreeEntry: true }));
      await expect(
        service.createTicket('ev-1', dto() as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza tipo de ticket ajeno', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType({ id: 'otro' })] }),
      );
      await expect(
        service.createTicket('ev-1', dto() as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza fecha fuera del evento', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType()] }),
      );
      await expect(
        service.createTicket(
          'ev-1',
          dto({ attendanceDate: '2026-08-01' }) as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza sin cupo del evento', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          totalTickets: 1,
          soldTickets: 1,
          ticketTypes: [buildTicketType()],
        }),
      );
      await expect(
        service.createTicket('ev-1', dto() as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('crea ticket simple', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType()] }),
      );
      ticketRepo.save.mockResolvedValue([{ id: 'tk-1' }]);
      const result = await service.createTicket('ev-1', dto() as never);
      expect(result).toHaveLength(1);
      expect(eventRepo.update).toHaveBeenCalled();
    });

    it('persiste el purchaseId pasado en opts en el ticket creado', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType()] }),
      );
      const result = await service.createTicket('ev-1', dto() as never, {
        purchaseId: 'purchase-1',
      });
      expect(result[0].purchaseId).toBe('purchase-1');
    });

    it('sin opts, el ticket creado queda con purchaseId null', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType()] }),
      );
      const result = await service.createTicket('ev-1', dto() as never);
      expect(result[0].purchaseId).toBeNull();
    });

    it('con allowOversell:true crea el ticket aunque no haya cupo del evento (oversell aceptado en fulfill de pago ya cobrado)', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          totalTickets: 1,
          soldTickets: 1,
          ticketTypes: [buildTicketType()],
        }),
      );
      const result = await service.createTicket('ev-1', dto() as never, {
        allowOversell: true,
      });
      expect(result).toHaveLength(1);
    });

    it('con allowOversell:true crea el ticket aunque el cupo total del tipo este agotado', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType({ totalStock: 1 })] }),
      );
      ticketQb.getCount.mockResolvedValue(1);
      const result = await service.createTicket(
        'ev-1',
        dto({ quantity: 1 }) as never,
        { allowOversell: true },
      );
      expect(result).toHaveLength(1);
    });

    it('sin allowOversell (comportamiento normal), sigue rechazando cupo total agotado', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType({ totalStock: 1 })] }),
      );
      ticketQb.getCount.mockResolvedValue(1);
      await expect(
        service.createTicket('ev-1', dto({ quantity: 1 }) as never, {
          allowOversell: false,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('devenga puntos de asistencia en taller con cliente registrado', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          isWorkshop: true,
          workshopPoints: 50,
          ticketTypes: [buildTicketType()],
        }),
      );
      ticketRepo.save.mockResolvedValue([{ id: 'tk-1' }]);
      await service.createTicket('ev-1', dto({ userId: 'u1' }) as never);
      expect(loyaltyServiceMock.earnAttendance).toHaveBeenCalledWith(
        'u1',
        'ev-1',
        50,
      );
    });

    it('no devenga asistencia si el evento no es taller', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType()] }),
      );
      ticketRepo.save.mockResolvedValue([{ id: 'tk-1' }]);
      await service.createTicket('ev-1', dto({ userId: 'u1' }) as never);
      expect(loyaltyServiceMock.earnAttendance).not.toHaveBeenCalled();
    });

    it('rechaza cupo diario agotado', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          ticketTypes: [
            buildTicketType({
              totalStock: null,
              dailyStocks: [{ date: '2026-07-02', quantity: 1 } as never],
            }),
          ],
        }),
      );
      ticketQb.getCount.mockResolvedValue(1);
      await expect(
        service.createTicket('ev-1', dto() as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza fecha sin cupo configurado', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          ticketTypes: [
            buildTicketType({
              totalStock: null,
              dailyStocks: [{ date: '2026-07-01', quantity: 5 } as never],
            }),
          ],
        }),
      );
      await expect(
        service.createTicket('ev-1', dto() as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza cupo total agotado', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType({ totalStock: 1 })] }),
      );
      ticketQb.getCount.mockResolvedValue(1);
      await expect(
        service.createTicket('ev-1', dto({ quantity: 1 }) as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('aplica promocion', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          ticketTypes: [
            buildTicketType({
              isPromotional: true,
              promoMinQuantity: 2,
              promoBundlePrice: 150,
            }),
          ],
        }),
      );
      ticketRepo.save.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      const result = await service.createTicket(
        'ev-1',
        dto({ quantity: 2, applyPromotion: true }) as never,
      );
      expect(result).toHaveLength(2);
    });

    it('rechaza promocion en ticket sin promo', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType()] }),
      );
      await expect(
        service.createTicket(
          'ev-1',
          dto({ quantity: 2, applyPromotion: true }) as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza cantidad menor al minimo de promocion', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          ticketTypes: [
            buildTicketType({
              isPromotional: true,
              promoMinQuantity: 3,
              promoBundlePrice: 150,
            }),
          ],
        }),
      );
      await expect(
        service.createTicket(
          'ev-1',
          dto({ quantity: 2, applyPromotion: true }) as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('crea ticket con menu personalizado', async () => {
      const tt = buildTicketType({
        menuMode: EventTicketMenuMode.CUSTOMIZABLE,
        menuTemplate: customizableTemplate().menuTemplate as never,
      });
      eventRepo.findOne.mockResolvedValue(buildEvent({ ticketTypes: [tt] }));
      ticketRepo.save.mockResolvedValue([{ id: 'tk-1' }]);
      const result = await service.createTicket(
        'ev-1',
        dto({
          menuSelection: {
            groups: [{ groupKey: 'plato', optionIds: ['pollo'] }],
          },
        }) as never,
      );
      expect(result).toHaveLength(1);
    });

    it('rechaza ticket personalizable sin seleccion', async () => {
      const tt = buildTicketType({
        menuMode: EventTicketMenuMode.CUSTOMIZABLE,
        menuTemplate: customizableTemplate().menuTemplate as never,
      });
      eventRepo.findOne.mockResolvedValue(buildEvent({ ticketTypes: [tt] }));
      await expect(
        service.createTicket('ev-1', dto() as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza seleccion en ticket fijo', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType()] }),
      );
      await expect(
        service.createTicket(
          'ev-1',
          dto({
            menuSelection: {
              groups: [{ groupKey: 'plato', optionIds: ['pollo'] }],
            },
          }) as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('exige jornada cuando el evento usa jornadas', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          hasSessions: true,
          sessions: [buildSession()],
          ticketTypes: [buildTicketType({ totalStock: null })],
        } as never),
      );

      await expect(
        service.createTicket('ev-1', {
          ticketTypeId: 'tt-1',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'Diaz',
          attendanceDate: new Date('2026-07-01'),
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza sessionId en evento sin jornadas', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType()] }),
      );

      await expect(
        service.createTicket('ev-1', {
          ticketTypeId: 'tt-1',
          sessionId: 'ss-1',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'Diaz',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('crea ticket en jornada con cupo y deriva attendanceDate', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          hasSessions: true,
          sessions: [buildSession()],
          ticketTypes: [buildTicketType({ totalStock: null })],
        } as never),
      );
      ticketQb.getCount.mockResolvedValue(0);

      const result = await service.createTicket('ev-1', {
        ticketTypeId: 'tt-1',
        sessionId: 'ss-1',
        attendeeFirstName: 'Ana',
        attendeeLastName: 'Diaz',
      } as never);

      expect(result[0].sessionId).toBe('ss-1');
      expect(result[0].attendanceDate).toBe('2026-07-01');
    });

    it('rechaza ticket cuando la jornada esta llena', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          hasSessions: true,
          totalTickets: 0,
          sessions: [buildSession({ capacity: 1 })],
          ticketTypes: [buildTicketType({ totalStock: null })],
        } as never),
      );
      ticketQb.getCount.mockResolvedValue(1);

      await expect(
        service.createTicket('ev-1', {
          ticketTypeId: 'tt-1',
          sessionId: 'ss-1',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'Diaz',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza ticket cuando el cupo del tipo en la jornada esta agotado', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          hasSessions: true,
          totalTickets: 0,
          sessions: [
            buildSession({
              capacity: 100,
              allocations: [
                {
                  id: 'al-1',
                  sessionId: 'ss-1',
                  ticketTypeId: 'tt-1',
                  quantity: 2,
                },
              ],
            }),
          ],
          ticketTypes: [buildTicketType({ totalStock: null })],
        } as never),
      );
      ticketQb.getCount.mockResolvedValue(2);

      await expect(
        service.createTicket('ev-1', {
          ticketTypeId: 'tt-1',
          sessionId: 'ss-1',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'Diaz',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('quotePublicPurchase', () => {
    it('quotePublicPurchase suma precio base + extra de menú por item', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 'e1',
        status: 'ENABLED',
        hasSessions: false,
        ticketTypes: [
          {
            id: 'tt1',
            name: 'Gen',
            price: 5000,
            menuMode: 'FIXED',
            menuTemplate: null,
          },
        ],
        sessions: [],
      } as any);

      const total = await service.quotePublicPurchase('e1', [
        {
          ticketTypeId: 'tt1',
          attendeeFirstName: 'A',
          attendeeLastName: 'B',
          attendanceDate: new Date('2026-08-01'),
        },
        {
          ticketTypeId: 'tt1',
          attendeeFirstName: 'C',
          attendeeLastName: 'D',
          attendanceDate: new Date('2026-08-01'),
        },
      ]);
      expect(total).toBe(10000);
    });

    it('incluye el extra de menu personalizado en el total', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          ticketTypes: [
            buildTicketType({
              id: 'tt-1',
              price: 100,
              ...customizableTemplate(),
            }),
          ],
        }),
      );

      const total = await service.quotePublicPurchase('ev-1', [
        {
          ticketTypeId: 'tt-1',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'Paz',
          attendanceDate: new Date('2026-07-02'),
          menuSelection: {
            groups: [{ groupKey: 'plato', optionIds: ['pollo'] }],
          } as never,
        },
      ]);

      // base 100 + extra de "pollo" (10) = 110
      expect(total).toBe(110);
    });

    it('quotePublicPurchaseDetailed devuelve una linea por ticket con asistente, hora de jornada y precio final', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          title: 'Coraline',
          ticketTypes: [
            buildTicketType({
              id: 'tt-1',
              price: 100,
              ...customizableTemplate(),
            }),
            buildTicketType({ id: 'tt-2', name: 'VIP', price: 250 }),
          ],
          sessions: [
            buildSession({ id: 'ss-1', startTime: '10:30:00' }),
          ] as never,
        }),
      );

      const quote = await service.quotePublicPurchaseDetailed('ev-1', [
        {
          ticketTypeId: 'tt-1',
          sessionId: 'ss-1',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'Paz',
          attendanceDate: new Date('2026-07-02'),
          menuSelection: {
            groups: [{ groupKey: 'plato', optionIds: ['pollo'] }],
          } as never,
        },
        {
          ticketTypeId: 'tt-2',
          attendeeFirstName: 'Luis',
          attendeeLastName: 'Diaz',
          attendanceDate: new Date('2026-07-02'),
        },
      ]);

      expect(quote.eventTitle).toBe('Coraline');
      expect(quote.lines).toEqual([
        {
          ticketTypeId: 'tt-1',
          ticketTypeName: 'General',
          unitPrice: 110, // base 100 + extra de menu 10
          attendeeName: 'Ana Paz',
          sessionTime: '10:30',
        },
        {
          ticketTypeId: 'tt-2',
          ticketTypeName: 'VIP',
          unitPrice: 250,
          attendeeName: 'Luis Diaz',
          sessionTime: null, // sin jornada elegida
        },
      ]);
      // El detalle siempre suma el total cobrado.
      expect(quote.lines.reduce((sum, l) => sum + l.unitPrice, 0)).toBe(
        quote.total,
      );
    });

    it('suma multiples items de distintos tipos de ticket', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          ticketTypes: [
            buildTicketType({ id: 'tt-1', price: 100 }),
            buildTicketType({ id: 'tt-2', price: 250 }),
          ],
        }),
      );

      const total = await service.quotePublicPurchase('ev-1', [
        {
          ticketTypeId: 'tt-1',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'Paz',
          attendanceDate: new Date('2026-07-02'),
        },
        {
          ticketTypeId: 'tt-2',
          attendeeFirstName: 'Luis',
          attendeeLastName: 'Diaz',
          attendanceDate: new Date('2026-07-02'),
        },
        {
          ticketTypeId: 'tt-2',
          attendeeFirstName: 'Eva',
          attendeeLastName: 'Ruiz',
          attendanceDate: new Date('2026-07-02'),
        },
      ]);

      // 100 + 250 + 250 = 600
      expect(total).toBe(600);
    });

    it('rechaza un ticketTypeId que no pertenece al evento en vez de cobrar 0', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          ticketTypes: [buildTicketType({ id: 'tt-1', price: 100 })],
        }),
      );

      await expect(
        service.quotePublicPurchase('ev-1', [
          {
            ticketTypeId: 'no-existe',
            attendeeFirstName: 'Ana',
            attendeeLastName: 'Paz',
            attendanceDate: new Date('2026-07-02'),
          },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cotiza tickets promocionales a precio de lista (quantity:1, applyPromotion:false)', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          ticketTypes: [
            buildTicketType({
              id: 'tt-1',
              price: 100,
              isPromotional: true,
              promoMinQuantity: 2,
              promoBundlePrice: 150,
            }),
          ],
        }),
      );

      const total = await service.quotePublicPurchase('ev-1', [
        {
          ticketTypeId: 'tt-1',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'Paz',
          attendanceDate: new Date('2026-07-02'),
        },
        {
          ticketTypeId: 'tt-1',
          attendeeFirstName: 'Luis',
          attendeeLastName: 'Diaz',
          attendanceDate: new Date('2026-07-02'),
        },
      ]);

      // Precio de lista (100 x 2 = 200), no el precio promocional en bloque
      // (150). La cotizacion nunca debe aplicar la promocion.
      expect(total).toBe(200);
    });

    it('el total cotizado coincide con la suma de los tickets efectivamente creados', async () => {
      const items = [
        {
          ticketTypeId: 'tt-1',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'Paz',
          attendanceDate: new Date('2026-07-02'),
        },
        {
          ticketTypeId: 'tt-1',
          attendeeFirstName: 'Luis',
          attendeeLastName: 'Diaz',
          attendanceDate: new Date('2026-07-02'),
        },
      ];

      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          ticketTypes: [buildTicketType({ id: 'tt-1', price: 100 })],
        }),
      );

      const total = await service.quotePublicPurchase('ev-1', items as never);

      const result = await service.createPublicTickets('ev-1', {
        buyerEmail: 'cliente@example.com',
        items: items as never,
      });

      const sumOfTickets = result.tickets.reduce((sum, t) => sum + t.price, 0);
      expect(total).toBe(sumOfTickets);
    });

    it('redondea el total a 2 decimales ante acumulacion de floats', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          ticketTypes: [
            buildTicketType({
              id: 'tt-1',
              price: 10.1,
              menuMode: EventTicketMenuMode.CUSTOMIZABLE,
              menuTemplate: {
                groups: [
                  {
                    key: 'extra',
                    label: 'Extra',
                    required: false,
                    minSelect: 0,
                    maxSelect: 1,
                    options: [{ id: 'opt', label: 'Opcion', extraPrice: 0.2 }],
                  },
                ],
              } as never,
            }),
          ],
        }),
      );

      const menuSelection = {
        groups: [{ groupKey: 'extra', optionIds: ['opt'] }],
      } as never;

      const total = await service.quotePublicPurchase('ev-1', [
        {
          ticketTypeId: 'tt-1',
          attendeeFirstName: 'A',
          attendeeLastName: 'B',
          attendanceDate: new Date('2026-07-02'),
          menuSelection,
        },
        {
          ticketTypeId: 'tt-1',
          attendeeFirstName: 'C',
          attendeeLastName: 'D',
          attendanceDate: new Date('2026-07-02'),
          menuSelection,
        },
        {
          ticketTypeId: 'tt-1',
          attendeeFirstName: 'E',
          attendeeLastName: 'F',
          attendanceDate: new Date('2026-07-02'),
          menuSelection,
        },
      ]);

      expect(total).toBe(30.9);
    });

    it('rechaza una compra sin items', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType()] }),
      );

      await expect(
        service.quotePublicPurchase('ev-1', []),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findTickets', () => {
    it('lista con filtros', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent());
      ticketRepo.find.mockResolvedValue([{ id: 'tk-1' }]);
      const result = await service.findTickets('ev-1', {
        ticketTypeId: 'tt-1',
        attendanceDate: '2026-07-02',
        status: EventTicketStatus.ACTIVE,
      } as never);
      expect(result).toHaveLength(1);
    });
  });

  describe('updateTicket', () => {
    const baseTicket = (overrides: Partial<EventTicket> = {}): EventTicket =>
      ({
        id: 'tk-1',
        eventId: 'ev-1',
        ticketTypeId: 'tt-1',
        attendeeFirstName: 'Ana',
        attendeeLastName: 'Paz',
        attendanceDate: '2026-07-02',
        price: 100,
        menuExtraPrice: 0,
        includesDetails: 'x',
        menuSelection: null,
        status: EventTicketStatus.ACTIVE,
        ...overrides,
      }) as EventTicket;

    it('rechaza ticket inexistente', async () => {
      ticketRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateTicket('ev-1', 'tk-x', {} as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('actualiza ticket basico', async () => {
      ticketRepo.findOne.mockResolvedValue(baseTicket());
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType()] }),
      );
      ticketRepo.save.mockResolvedValue(
        baseTicket({ attendeeFirstName: 'Bob' }),
      );
      const result = await service.updateTicket('ev-1', 'tk-1', {
        attendeeFirstName: ' Bob ',
        price: 120,
      } as never);
      expect(result).toBeDefined();
      expect(eventRepo.update).toHaveBeenCalled();
    });

    it('cancela ticket sin verificar disponibilidad', async () => {
      ticketRepo.findOne.mockResolvedValue(baseTicket());
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType()] }),
      );
      ticketRepo.save.mockResolvedValue(
        baseTicket({ status: EventTicketStatus.CANCELLED }),
      );
      const result = await service.updateTicket('ev-1', 'tk-1', {
        status: EventTicketStatus.CANCELLED,
      } as never);
      expect(result).toBeDefined();
    });

    it('reactiva ticket cancelado', async () => {
      ticketRepo.findOne.mockResolvedValue(
        baseTicket({ status: EventTicketStatus.CANCELLED }),
      );
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType()] }),
      );
      ticketRepo.save.mockResolvedValue(baseTicket());
      const result = await service.updateTicket('ev-1', 'tk-1', {
        status: EventTicketStatus.ACTIVE,
      } as never);
      expect(result).toBeDefined();
    });

    it('rechaza si el evento es de entrada liberada', async () => {
      ticketRepo.findOne.mockResolvedValue(baseTicket());
      eventRepo.findOne.mockResolvedValue(buildEvent({ isFreeEntry: true }));
      await expect(
        service.updateTicket('ev-1', 'tk-1', {} as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('removeTicket', () => {
    it('rechaza ticket inexistente', async () => {
      ticketRepo.findOne.mockResolvedValue(null);
      await expect(service.removeTicket('ev-1', 'tk-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('elimina ticket activo y sincroniza', async () => {
      ticketRepo.findOne.mockResolvedValue({
        id: 'tk-1',
        status: EventTicketStatus.ACTIVE,
      });
      const result = await service.removeTicket('ev-1', 'tk-1');
      expect(result.message).toContain('eliminado');
      expect(eventRepo.update).toHaveBeenCalled();
    });

    it('elimina ticket cancelado sin sincronizar', async () => {
      ticketRepo.findOne.mockResolvedValue({
        id: 'tk-1',
        status: EventTicketStatus.CANCELLED,
      });
      await service.removeTicket('ev-1', 'tk-1');
      expect(eventRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('validacion de jornadas al crear', () => {
    const createWithSessions = (
      sessions: unknown[],
      extra: Record<string, unknown> = {},
    ) =>
      service.create({
        title: 'Jornadas',
        startsAt: START,
        endsAt: END,
        hasSessions: true,
        ticketTypes: [makeTicketTypeDto()],
        sessions,
        ...extra,
      } as never);

    it('rechaza entrada liberada con jornadas', async () => {
      await expect(
        service.create({
          title: 'X',
          startsAt: START,
          endsAt: END,
          hasSessions: true,
          isFreeEntry: true,
          sessions: [{ date: START, startTime: '12:00', capacity: 5 }],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza hasSessions sin jornadas', async () => {
      await expect(createWithSessions([])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza jornadas cuando el evento no las usa', async () => {
      await expect(
        service.create({
          title: 'X',
          startsAt: START,
          endsAt: END,
          hasSessions: false,
          ticketTypes: [makeTicketTypeDto()],
          sessions: [{ date: START, startTime: '12:00', capacity: 5 }],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza jornada con hora de termino menor o igual al inicio', async () => {
      await expect(
        createWithSessions([
          {
            date: new Date('2026-07-01'),
            startTime: '12:00',
            endTime: '12:00',
            capacity: 5,
          },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza jornada que repite cupos del mismo tipo de ticket', async () => {
      await expect(
        createWithSessions([
          {
            date: new Date('2026-07-01'),
            startTime: '12:00',
            capacity: 5,
            allocations: [
              { ticketTypeIndex: 0, quantity: 1 },
              { ticketTypeIndex: 0, quantity: 1 },
            ],
          },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('validacion de plantillas de menu', () => {
    const createWithTemplate = (menuTemplate: unknown) =>
      service.create({
        title: 'Menu',
        startsAt: START,
        endsAt: END,
        ticketTypes: [
          makeTicketTypeDto({
            menuMode: EventTicketMenuMode.CUSTOMIZABLE,
            menuTemplate,
          }),
        ],
      } as never);

    const group = (overrides: Record<string, unknown> = {}) => ({
      key: 'plato',
      label: 'Plato',
      options: [
        { id: 'carne', label: 'Carne', extraPrice: 0 },
        { id: 'pollo', label: 'Pollo', extraPrice: 10 },
      ],
      ...overrides,
    });

    it('rechaza plantilla sin grupos', async () => {
      await expect(createWithTemplate({ groups: [] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza grupos con clave duplicada', async () => {
      await expect(
        createWithTemplate({ groups: [group(), group({ label: 'Plato 2' })] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza grupo sin clave o nombre', async () => {
      await expect(
        createWithTemplate({ groups: [group({ key: '  ' })] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza grupo sin opciones', async () => {
      await expect(
        createWithTemplate({ groups: [group({ options: [] })] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza opcion sin id o nombre', async () => {
      await expect(
        createWithTemplate({
          groups: [group({ options: [{ id: 'carne', label: ' ' }] })],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza opciones repetidas', async () => {
      await expect(
        createWithTemplate({
          groups: [
            group({
              options: [
                { id: 'carne', label: 'Carne' },
                { id: 'CARNE', label: 'Carne otra vez' },
              ],
            }),
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza recargo negativo', async () => {
      await expect(
        createWithTemplate({
          groups: [
            group({
              options: [{ id: 'carne', label: 'Carne', extraPrice: -5 }],
            }),
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza grupo sin opciones activas', async () => {
      await expect(
        createWithTemplate({
          groups: [
            group({
              options: [
                { id: 'carne', label: 'Carne', isActive: false },
                { id: 'pollo', label: 'Pollo', isActive: false },
              ],
            }),
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza minSelect invalido', async () => {
      await expect(
        createWithTemplate({ groups: [group({ minSelect: -1 })] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza maxSelect invalido', async () => {
      await expect(
        createWithTemplate({ groups: [group({ maxSelect: 0 })] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza minSelect mayor que maxSelect', async () => {
      await expect(
        createWithTemplate({
          groups: [group({ minSelect: 2, maxSelect: 1 })],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza minSelect mayor a las opciones activas', async () => {
      await expect(
        createWithTemplate({
          groups: [
            group({
              minSelect: 2,
              maxSelect: 2,
              options: [
                { id: 'carne', label: 'Carne' },
                { id: 'pollo', label: 'Pollo', isActive: false },
              ],
            }),
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza maxSelect mayor a las opciones activas', async () => {
      await expect(
        createWithTemplate({ groups: [group({ maxSelect: 3 })] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('acepta grupo opcional (required=false) con minSelect implicito 0', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent());
      await createWithTemplate({ groups: [group({ required: false })] });
      expect(txTicketType.save).toHaveBeenCalled();
    });
  });

  describe('seleccion de menu al emitir ticket', () => {
    const menuTicketType = () =>
      buildTicketType({
        menuMode: EventTicketMenuMode.CUSTOMIZABLE,
        menuTemplate: {
          groups: [
            {
              key: 'plato',
              label: 'Plato',
              required: true,
              minSelect: 1,
              maxSelect: 1,
              options: [
                { id: 'carne', label: 'Carne', extraPrice: 0, isActive: true },
                { id: 'pollo', label: 'Pollo', extraPrice: 10, isActive: true },
                {
                  id: 'vegano',
                  label: 'Vegano',
                  extraPrice: 5,
                  isActive: false,
                },
              ],
            },
          ],
        },
      } as never);

    const createTicketWithSelection = (menuSelection?: unknown) => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [menuTicketType()] }),
      );
      return service.createTicket('ev-1', {
        ticketTypeId: 'tt-1',
        attendeeFirstName: 'Ana',
        attendeeLastName: 'Diaz',
        attendanceDate: new Date('2026-07-01'),
        menuSelection,
      } as never);
    };

    it('exige seleccion en tickets con menu personalizable', async () => {
      await expect(createTicketWithSelection()).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza seleccion con formato invalido', async () => {
      await expect(
        createTicketWithSelection({ groups: 'nope' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza grupos duplicados en la seleccion', async () => {
      await expect(
        createTicketWithSelection({
          groups: [
            { groupKey: 'plato', optionIds: ['carne'] },
            { groupKey: 'PLATO', optionIds: ['pollo'] },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza grupo sin clave', async () => {
      await expect(
        createTicketWithSelection({ groups: [{ optionIds: ['carne'] }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza grupo sin lista de opciones', async () => {
      await expect(
        createTicketWithSelection({ groups: [{ groupKey: 'plato' }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza grupo que no existe en la plantilla', async () => {
      await expect(
        createTicketWithSelection({
          groups: [{ groupKey: 'postre', optionIds: ['flan'] }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza seleccion bajo el minimo', async () => {
      await expect(
        createTicketWithSelection({
          groups: [{ groupKey: 'plato', optionIds: [] }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza seleccion sobre el maximo', async () => {
      await expect(
        createTicketWithSelection({
          groups: [{ groupKey: 'plato', optionIds: ['carne', 'pollo'] }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza opcion inactiva o inexistente', async () => {
      await expect(
        createTicketWithSelection({
          groups: [{ groupKey: 'plato', optionIds: ['vegano'] }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deduplica optionIds repetidos y suma el recargo una vez', async () => {
      const [ticket] = await createTicketWithSelection({
        groups: [{ groupKey: 'plato', optionIds: ['pollo', 'POLLO'] }],
      });
      expect(ticket.menuExtraPrice).toBe(10);
      expect(ticket.price).toBe(110);
      expect(ticket.includesDetails).toBe('Plato: Pollo');
    });

    it('rechaza seleccion de menu en ticket de menu fijo', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType()] }),
      );
      await expect(
        service.createTicket('ev-1', {
          ticketTypeId: 'tt-1',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'Diaz',
          attendanceDate: new Date('2026-07-01'),
          menuSelection: {
            groups: [{ groupKey: 'plato', optionIds: ['carne'] }],
          },
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cupos al emitir tickets', () => {
    const emit = (
      ticketType: EventTicketType,
      dto: Record<string, unknown>,
    ) => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [ticketType] }),
      );
      return service.createTicket('ev-1', {
        ticketTypeId: 'tt-1',
        attendeeFirstName: 'Ana',
        attendeeLastName: 'Diaz',
        attendanceDate: new Date('2026-07-01'),
        ...dto,
      } as never);
    };

    it('exige fecha de asistencia en eventos sin jornadas', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType()] }),
      );
      await expect(
        service.createTicket('ev-1', {
          ticketTypeId: 'tt-1',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'Diaz',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza fecha sin cupo diario configurado', async () => {
      await expect(
        emit(
          buildTicketType({
            dailyStocks: [{ date: '2026-07-02', quantity: 5 }] as never,
          }),
          {},
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza cuando el cupo diario esta agotado', async () => {
      ticketQb.getCount.mockResolvedValue(5);
      await expect(
        emit(
          buildTicketType({
            dailyStocks: [{ date: '2026-07-01', quantity: 5 }] as never,
          }),
          {},
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza cuando el cupo total esta agotado', async () => {
      ticketQb.getCount.mockResolvedValue(50);
      await expect(
        emit(buildTicketType({ totalStock: 50 }), {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('permite oversell cuando el pago ya fue capturado', async () => {
      ticketQb.getCount.mockResolvedValue(50);
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ ticketTypes: [buildTicketType({ totalStock: 50 })] }),
      );
      const tickets = await service.createTicket(
        'ev-1',
        {
          ticketTypeId: 'tt-1',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'Diaz',
          attendanceDate: new Date('2026-07-01'),
        } as never,
        { allowOversell: true, buyerEmail: 'a@b.cl', purchaseId: 'pur-1' },
      );
      expect(tickets).toHaveLength(1);
    });

    it('aplica precio promocional por bloques', async () => {
      const tickets = await emit(
        buildTicketType({
          isPromotional: true,
          promoMinQuantity: 2,
          promoBundlePrice: 150,
        }),
        { quantity: 3, applyPromotion: true },
      );
      expect(tickets.map((ticket) => ticket.price)).toEqual([75, 75, 100]);
    });

    it('rechaza promocion en ticket no promocional', async () => {
      await expect(
        emit(buildTicketType(), { quantity: 2, applyPromotion: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza promocion bajo la cantidad minima', async () => {
      await expect(
        emit(
          buildTicketType({
            isPromotional: true,
            promoMinQuantity: 3,
            promoBundlePrice: 150,
          }),
          { quantity: 2, applyPromotion: true },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cupos por jornada', () => {
    const sessionEvent = (
      sessionOverrides: Record<string, unknown> = {},
      ticketTypeOverrides: Partial<EventTicketType> = {},
    ) =>
      buildEvent({
        hasSessions: true,
        ticketTypes: [buildTicketType(ticketTypeOverrides)],
        sessions: [buildSession(sessionOverrides)],
      } as never);

    const emitForSession = () =>
      service.createTicket('ev-1', {
        ticketTypeId: 'tt-1',
        sessionId: 'ss-1',
        attendeeFirstName: 'Ana',
        attendeeLastName: 'Diaz',
      } as never);

    it('rechaza jornada que no pertenece al evento', async () => {
      eventRepo.findOne.mockResolvedValue(sessionEvent());
      await expect(
        service.createTicket('ev-1', {
          ticketTypeId: 'tt-1',
          sessionId: 'ss-x',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'Diaz',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza cuando la jornada esta llena', async () => {
      eventRepo.findOne.mockResolvedValue(sessionEvent({ capacity: 2 }));
      ticketQb.getCount.mockResolvedValue(2);
      await expect(emitForSession()).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza cuando el cupo del tipo en la jornada esta agotado', async () => {
      eventRepo.findOne.mockResolvedValue(
        sessionEvent({
          capacity: 10,
          allocations: [{ ticketTypeId: 'tt-1', quantity: 1 }],
        }),
      );
      ticketQb.getCount.mockResolvedValue(1);
      await expect(emitForSession()).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza cuando el cupo total del tipo esta agotado en jornadas', async () => {
      eventRepo.findOne.mockResolvedValue(
        sessionEvent({ capacity: 100 }, { totalStock: 3 }),
      );
      ticketQb.getCount.mockResolvedValue(3);
      await expect(emitForSession()).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('getPublicDetail', () => {
    it('rechaza eventos no habilitados', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({ status: EventStatus.CANCELLED }),
      );
      await expect(service.getPublicDetail('ev-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('calcula remanentes por tipo, jornada y evento', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          totalTickets: 40,
          hasSessions: true,
          ticketTypes: [
            buildTicketType({ id: 'tt-1', totalStock: 10 }),
            buildTicketType({ id: 'tt-2', totalStock: null }),
          ],
          sessions: [
            buildSession({
              capacity: 8,
              allocations: [{ ticketTypeId: 'tt-1', quantity: 4 }],
            }),
          ],
        } as never),
      );
      ticketQb.getCount.mockResolvedValue(2);
      ticketRepo.countBy.mockResolvedValue(6);

      const detail = await service.getPublicDetail('ev-1');

      expect(detail.ticketTypes[0].remaining).toBe(8);
      expect(detail.ticketTypes[1].remaining).toBeNull();
      expect(detail.ticketTypes[1].available).toBe(true);
      // tt-1 => min(cap 8-2, alloc 4-2, total 10-2) = 2; tt-2 => cap 8-2 = 6.
      // El remanente de la jornada es la mejor disponibilidad entre tipos.
      expect(detail.sessions[0].remaining).toBe(6);
      expect(detail.sessions[0].seatsRemaining).toBe(6);
      expect(detail.seatsRemaining).toBe(34);
    });

    it('remanente de jornada es el mejor entre tipos acotados', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          totalTickets: 0,
          hasSessions: true,
          ticketTypes: [buildTicketType({ id: 'tt-1', totalStock: 10 })],
          sessions: [
            buildSession({
              capacity: 8,
              allocations: [{ ticketTypeId: 'tt-1', quantity: 4 }],
            }),
          ],
        } as never),
      );
      ticketQb.getCount.mockResolvedValue(2);

      const detail = await service.getPublicDetail('ev-1');

      // min(capacidad 8-2, allocation 4-2, total 10-2) = 2
      expect(detail.sessions[0].remaining).toBe(2);
      expect(detail.seatsRemaining).toBeNull();
    });

    it('remaining 0 cuando no hay cupo diario para la fecha de inicio', async () => {
      eventRepo.findOne.mockResolvedValue(
        buildEvent({
          totalTickets: 0,
          ticketTypes: [
            buildTicketType({
              totalStock: null,
              dailyStocks: [{ date: '2026-07-02', quantity: 5 }],
            } as never),
          ],
        }),
      );

      const detail = await service.getPublicDetail('ev-1');

      expect(detail.ticketTypes[0].remaining).toBe(0);
      expect(detail.ticketTypes[0].available).toBe(false);
    });
  });
});
