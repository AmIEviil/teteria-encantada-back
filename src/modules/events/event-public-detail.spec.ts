import { NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';

// Typed as `any` (not `EventsService & Record<string, any>`) so that stubbing
// private members here doesn't trip `tsc`'s private-access checks; ts-jest
// doesn't enforce this diagnostic, but plain `tsc --noEmit` does.
type AnyService = any;

const makeService = (soldCounts: number): AnyService => {
  const svc: AnyService = Object.create(EventsService.prototype);
  svc.countActiveTickets = jest.fn().mockResolvedValue(soldCounts);
  svc.eventTicketRepository = {
    createQueryBuilder: () => {
      const qb: any = {};
      qb.where = () => qb;
      qb.andWhere = () => qb;
      qb.getCount = async () => soldCounts;
      return qb;
    },
  };
  svc.toDateOnly = (d: string) => d;
  return svc;
};

describe('getRemainingForSession', () => {
  it('returns capacity minus sold when no allocation and no totalStock', async () => {
    const svc = makeService(3);
    const session: any = { id: 's1', capacity: 10, allocations: [] };
    const ticketType: any = { id: 't1', totalStock: null };
    await expect(svc.getRemainingForSession(session, ticketType)).resolves.toBe(
      7,
    );
  });

  it('is capped by the smallest applicable layer (allocation)', async () => {
    const svc = makeService(1);
    const session: any = {
      id: 's1',
      capacity: 10,
      allocations: [{ ticketTypeId: 't1', quantity: 2 }],
    };
    const ticketType: any = { id: 't1', totalStock: null };
    // capacity remaining 9, allocation remaining 1 -> min 1
    await expect(svc.getRemainingForSession(session, ticketType)).resolves.toBe(
      1,
    );
  });
});

describe('getRemainingForType', () => {
  it('returns null (unlimited) when no dailyStocks and no totalStock', async () => {
    const svc = makeService(5);
    const ticketType: any = { id: 't1', dailyStocks: [], totalStock: null };
    await expect(
      svc.getRemainingForType(ticketType, '2026-08-01'),
    ).resolves.toBeNull();
  });

  it('returns 0 when a day has no configured daily stock', async () => {
    const svc = makeService(0);
    const ticketType: any = {
      id: 't1',
      dailyStocks: [{ date: '2026-08-02', quantity: 5 }],
      totalStock: null,
    };
    await expect(
      svc.getRemainingForType(ticketType, '2026-08-01'),
    ).resolves.toBe(0);
  });

  it('returns totalStock minus sold when only totalStock set', async () => {
    const svc = makeService(4);
    const ticketType: any = { id: 't1', dailyStocks: [], totalStock: 10 };
    await expect(
      svc.getRemainingForType(ticketType, '2026-08-01'),
    ).resolves.toBe(6);
  });

  it('returns quantity minus sold when the day matches a configured dailyStock entry', async () => {
    // makeService(3) stubs both the day-count path (getCount) and the
    // totalStock path (countActiveTickets) to resolve 3; totalStock is null
    // here so only the daily-stock layer applies: 8 - 3 = 5.
    const svc = makeService(3);
    const ticketType: any = {
      id: 't1',
      dailyStocks: [{ date: '2026-08-01', quantity: 8 }],
      totalStock: null,
    };
    await expect(
      svc.getRemainingForType(ticketType, '2026-08-01'),
    ).resolves.toBe(5);
  });
});

describe('getPublicDetail', () => {
  it('keeps session remaining/available consistent and does not leak internal fields', async () => {
    const svc: AnyService = Object.create(EventsService.prototype);

    const soldOutType: any = {
      id: 'tt-sold-out',
      name: 'Sold out',
      description: null,
      price: 1000,
      includesDetails: null,
      menuMode: 'FIXED',
      menuTemplate: null,
      isPromotional: true,
      promoMinQuantity: 2,
      promoBundlePrice: 1500,
    };
    const availableType: any = {
      id: 'tt-available',
      name: 'Available',
      description: null,
      price: 2000,
      includesDetails: null,
      menuMode: 'FIXED',
      menuTemplate: null,
      isPromotional: false,
      promoMinQuantity: null,
      promoBundlePrice: null,
    };
    const session: any = {
      id: 's1',
      date: '2026-08-01',
      startTime: '10:00',
      endTime: null,
      name: null,
      capacity: 20,
      allocations: [],
    };
    const event: any = {
      id: 'evt-1',
      title: 'Evento',
      description: null,
      startsAt: new Date('2026-08-01T10:00:00.000Z'),
      endsAt: new Date('2026-08-01T12:00:00.000Z'),
      officialImageUrl: null,
      status: 'ENABLED',
      isFreeEntry: false,
      hasSessions: true,
      soldTickets: 5,
      totalTickets: 10,
      ticketTypes: [soldOutType, availableType],
      sessions: [session],
    };

    svc.findOne = jest.fn().mockResolvedValue(event);
    svc.countActiveTickets = jest.fn().mockResolvedValue(3); // vendidos por jornada
    svc.eventTicketRepository = { countBy: jest.fn().mockResolvedValue(4) }; // vendidos del evento
    svc.getRemainingForType = jest
      .fn()
      .mockImplementation(async (t: any) => (t.id === 'tt-sold-out' ? 0 : 5));
    svc.getRemainingForSession = jest
      .fn()
      .mockImplementation(async (_s: any, t: any) =>
        t.id === 'tt-sold-out' ? 0 : 5,
      );

    const result = await svc.getPublicDetail('evt-1');

    expect(result.sessions).toHaveLength(1);
    const sessionResult = result.sessions[0];

    // Fix under test: remaining and available must agree with each other.
    expect(sessionResult.remaining).toBeGreaterThan(0);
    expect(sessionResult.available).toBe(true);

    // cupo agregado: jornada = capacity - vendidos; evento = totalTickets - vendidos.
    expect(sessionResult.seatsRemaining).toBe(17); // 20 - 3
    expect(result.seatsRemaining).toBe(6); // 10 - 4

    for (const tt of [...result.ticketTypes, ...sessionResult.ticketTypes]) {
      expect(tt).not.toHaveProperty('isPromotional');
      expect(tt).not.toHaveProperty('promoMinQuantity');
      expect(tt).not.toHaveProperty('promoBundlePrice');
    }
    expect(result).not.toHaveProperty('soldTickets');
    expect(result).not.toHaveProperty('totalTickets');
  });

  it('throws NotFoundException for a non-ENABLED event', async () => {
    const svc: AnyService = Object.create(EventsService.prototype);
    svc.findOne = jest.fn().mockResolvedValue({ status: 'CANCELLED' });

    await expect(svc.getPublicDetail('evt-2')).rejects.toThrow(
      NotFoundException,
    );
  });
});
