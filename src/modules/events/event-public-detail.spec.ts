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
    await expect(svc.getRemainingForSession(session, ticketType)).resolves.toBe(7);
  });

  it('is capped by the smallest applicable layer (allocation)', async () => {
    const svc = makeService(1);
    const session: any = {
      id: 's1', capacity: 10,
      allocations: [{ ticketTypeId: 't1', quantity: 2 }],
    };
    const ticketType: any = { id: 't1', totalStock: null };
    // capacity remaining 9, allocation remaining 1 -> min 1
    await expect(svc.getRemainingForSession(session, ticketType)).resolves.toBe(1);
  });
});

describe('getRemainingForType', () => {
  it('returns null (unlimited) when no dailyStocks and no totalStock', async () => {
    const svc = makeService(5);
    const ticketType: any = { id: 't1', dailyStocks: [], totalStock: null };
    await expect(svc.getRemainingForType(ticketType, '2026-08-01')).resolves.toBeNull();
  });

  it('returns 0 when a day has no configured daily stock', async () => {
    const svc = makeService(0);
    const ticketType: any = {
      id: 't1',
      dailyStocks: [{ date: '2026-08-02', quantity: 5 }],
      totalStock: null,
    };
    await expect(svc.getRemainingForType(ticketType, '2026-08-01')).resolves.toBe(0);
  });

  it('returns totalStock minus sold when only totalStock set', async () => {
    const svc = makeService(4);
    const ticketType: any = { id: 't1', dailyStocks: [], totalStock: 10 };
    await expect(svc.getRemainingForType(ticketType, '2026-08-01')).resolves.toBe(6);
  });
});
