import { EventsService } from './events.service';

// Typed as `any` (not `EventsService & Record<string, any>`) so that stubbing
// private members here doesn't trip `tsc`'s private-access checks; ts-jest
// doesn't enforce this diagnostic, but plain `tsc --noEmit` does.
type AnyService = any;

describe('createPublicTickets', () => {
  const buildService = () => {
    const svc = Object.create(EventsService.prototype) as AnyService;
    svc.syncEventSoldTickets = jest.fn().mockResolvedValue(undefined);
    svc.findOne = jest.fn().mockResolvedValue({ id: 'e1', title: 'Evento' });
    svc.eventTicketRepository = { delete: jest.fn().mockResolvedValue(undefined) };
    return svc;
  };

  it('creates one ticket per item and totals prices', async () => {
    const svc = buildService();
    svc.createTicket = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'k1', ticketType: { name: 'A' }, attendeeFirstName: 'Ana', attendeeLastName: 'P', attendanceDate: '2026-08-01', sessionId: null, price: 5000, menuExtraPrice: 0, includesDetails: null, menuSelectionSnapshot: null }])
      .mockResolvedValueOnce([{ id: 'k2', ticketType: { name: 'B' }, attendeeFirstName: 'Leo', attendeeLastName: 'R', attendanceDate: '2026-08-01', sessionId: null, price: 7000, menuExtraPrice: 0, includesDetails: null, menuSelectionSnapshot: null }]);

    const result = await svc.createPublicTickets('e1', {
      buyerEmail: 'a@b.cl',
      items: [
        { ticketTypeId: 't1', attendanceDate: new Date('2026-08-01'), attendeeFirstName: 'Ana', attendeeLastName: 'P' },
        { ticketTypeId: 't2', attendanceDate: new Date('2026-08-01'), attendeeFirstName: 'Leo', attendeeLastName: 'R' },
      ],
    });

    expect(svc.createTicket).toHaveBeenCalledTimes(2);
    expect(result.total).toBe(12000);
    expect(result.tickets).toHaveLength(2);
    expect(result.buyerEmail).toBe('a@b.cl');
  });

  it('compensating-deletes created tickets when a later item fails', async () => {
    const svc = buildService();
    svc.createTicket = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'k1', ticketType: { name: 'A' }, price: 5000, menuExtraPrice: 0 }])
      .mockRejectedValueOnce(new Error('sin cupo'));

    await expect(
      svc.createPublicTickets('e1', {
        buyerEmail: 'a@b.cl',
        items: [
          { ticketTypeId: 't1', attendanceDate: new Date(), attendeeFirstName: 'Ana', attendeeLastName: 'P' },
          { ticketTypeId: 't2', attendanceDate: new Date(), attendeeFirstName: 'Leo', attendeeLastName: 'R' },
        ],
      }),
    ).rejects.toThrow('sin cupo');

    expect(svc.eventTicketRepository.delete).toHaveBeenCalledWith(['k1']);
    expect(svc.syncEventSoldTickets).toHaveBeenCalled();
  });
});
