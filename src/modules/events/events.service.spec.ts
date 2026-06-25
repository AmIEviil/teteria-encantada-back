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

describe('EventsService', () => {
  let service: EventsService;
  let eventRepo: AnyRepo;
  let ticketTypeRepo: AnyRepo;
  let dailyStockRepo: AnyRepo;
  let ticketRepo: AnyRepo;
  let txEvent: AnyRepo;
  let txTicketType: AnyRepo;
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
      save: jest.fn((v) => Promise.resolve(v)),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const entityManager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === Event ? txEvent : txTicketType,
      ),
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
        status: EventStatus.DISABLED,
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
  });

  describe('updateStatus', () => {
    it('actualiza estado', async () => {
      eventRepo.findOne.mockResolvedValue(buildEvent());
      const result = await service.updateStatus('ev-1', {
        status: EventStatus.DISABLED,
      } as never);
      expect(eventRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
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
        buildEvent({ status: EventStatus.DISABLED }),
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
});
