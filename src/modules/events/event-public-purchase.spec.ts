import { EventsService } from './events.service';

describe('createPublicTickets', () => {
  const buildService = () => {
    const svc = Object.create(EventsService.prototype);
    svc.syncEventSoldTickets = jest.fn().mockResolvedValue(undefined);
    svc.findOne = jest.fn().mockResolvedValue({
      id: 'e1',
      title: 'Evento',
      ticketTypes: [
        { id: 'tt1', name: 'Entrada General' },
        { id: 'tt2', name: 'Entrada VIP' },
      ],
    });
    svc.eventTicketRepository = {
      delete: jest.fn().mockResolvedValue(undefined),
    };
    return svc;
  };

  it('creates one ticket per item and totals prices', async () => {
    const svc = buildService();
    // `createTicket` internally uses `eventTicketRepository.create` + `save`,
    // whose return value never populates the eager `ticketType` relation —
    // only find/findOne reads do. Mocked here without `ticketType` to match
    // reality; the ticket type name must be resolved from `event.ticketTypes`.
    svc.createTicket = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'k1',
          ticketTypeId: 'tt1',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'P',
          attendanceDate: '2026-08-01',
          sessionId: null,
          price: 5000,
          menuExtraPrice: 0,
          includesDetails: null,
          menuSelectionSnapshot: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'k2',
          ticketTypeId: 'tt2',
          attendeeFirstName: 'Leo',
          attendeeLastName: 'R',
          attendanceDate: '2026-08-01',
          sessionId: null,
          price: 7000,
          menuExtraPrice: 0,
          includesDetails: null,
          menuSelectionSnapshot: null,
        },
      ]);

    const result = await svc.createPublicTickets('e1', {
      buyerEmail: 'a@b.cl',
      items: [
        {
          ticketTypeId: 't1',
          attendanceDate: new Date('2026-08-01'),
          attendeeFirstName: 'Ana',
          attendeeLastName: 'P',
        },
        {
          ticketTypeId: 't2',
          attendanceDate: new Date('2026-08-01'),
          attendeeFirstName: 'Leo',
          attendeeLastName: 'R',
        },
      ],
    });

    expect(svc.createTicket).toHaveBeenCalledTimes(2);
    expect(result.total).toBe(12000);
    expect(result.tickets).toHaveLength(2);
    expect(result.buyerEmail).toBe('a@b.cl');
    expect(result.tickets[0].ticketTypeName).toBe('Entrada General');
    expect(result.tickets[1].ticketTypeName).toBe('Entrada VIP');
  });

  it('compensating-deletes created tickets when a later item fails', async () => {
    const svc = buildService();
    svc.createTicket = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'k1', ticketTypeId: 'tt1', price: 5000, menuExtraPrice: 0 },
      ])
      .mockRejectedValueOnce(new Error('sin cupo'));

    await expect(
      svc.createPublicTickets('e1', {
        buyerEmail: 'a@b.cl',
        items: [
          {
            ticketTypeId: 't1',
            attendanceDate: new Date(),
            attendeeFirstName: 'Ana',
            attendeeLastName: 'P',
          },
          {
            ticketTypeId: 't2',
            attendanceDate: new Date(),
            attendeeFirstName: 'Leo',
            attendeeLastName: 'R',
          },
        ],
      }),
    ).rejects.toThrow('sin cupo');

    expect(svc.eventTicketRepository.delete).toHaveBeenCalledWith(['k1']);
    expect(svc.syncEventSoldTickets).toHaveBeenCalled();
  });

  it('forwards purchaseId and allowOversell to each createTicket call', async () => {
    const svc = buildService();
    svc.createTicket = jest.fn().mockResolvedValue([
      {
        id: 'k1',
        ticketTypeId: 'tt1',
        attendeeFirstName: 'Ana',
        attendeeLastName: 'P',
        attendanceDate: '2026-08-01',
        sessionId: null,
        price: 5000,
        menuExtraPrice: 0,
        includesDetails: null,
        menuSelectionSnapshot: null,
      },
    ]);

    await svc.createPublicTickets('e1', {
      buyerEmail: 'a@b.cl',
      purchaseId: 'purchase-1',
      allowOversell: true,
      items: [
        {
          ticketTypeId: 't1',
          attendanceDate: new Date('2026-08-01'),
          attendeeFirstName: 'Ana',
          attendeeLastName: 'P',
        },
      ],
    });

    expect(svc.createTicket).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ ticketTypeId: 't1' }),
      {
        buyerEmail: 'a@b.cl',
        purchaseId: 'purchase-1',
        allowOversell: true,
      },
    );
  });
});
