import { EventsService } from './events.service';

describe('createPurchase (venta manual)', () => {
  const pdf = Buffer.from('pdf');
  const savedPurchase = {
    id: 'p1',
    eventId: 'e1',
    buyerEmail: 'a@b.cl',
    itemsSnapshot: [{ ticketTypeId: 'tt1' }],
    total: 0,
  };

  const buildService = () => {
    const svc = Object.create(EventsService.prototype);
    svc.purchaseRepository = {
      create: jest.fn((v) => v),
      save: jest.fn().mockResolvedValue(savedPurchase),
    };
    svc.createPublicTickets = jest.fn().mockResolvedValue({
      eventTitle: 'Evento',
      total: 5000,
      tickets: [
        {
          id: 'k1',
          ticketTypeName: 'General',
          attendeeFirstName: 'Ana',
          attendeeLastName: 'P',
          attendanceDate: '2026-08-01',
          sessionId: null,
          menuSummary: null,
          price: 5000,
        },
      ],
    });
    svc.findOne = jest.fn().mockResolvedValue({
      id: 'e1',
      startsAt: new Date('2026-08-01T15:00:00'),
      ticketTypes: [],
      sessions: [],
    });
    svc.getTicketSequences = jest.fn().mockResolvedValue(new Map());
    svc.ticketsPdfService = {
      buildTicketsPdf: jest.fn().mockResolvedValue(pdf),
    };
    svc.mailerService = { send: jest.fn().mockResolvedValue(undefined) };
    svc.salesArchiveService = {
      archiveManualSale: jest.fn().mockResolvedValue(undefined),
    };
    return svc;
  };

  const dto = {
    buyerEmail: 'a@b.cl',
    paymentMethod: 'EFECTIVO',
    items: [
      {
        ticketTypeId: 'tt1',
        attendeeFirstName: 'Ana',
        attendeeLastName: 'P',
      },
    ],
  };

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('archiva la compra guardada con el mismo PDF adjuntado al correo', async () => {
    const svc = buildService();
    await svc.createPurchase('e1', dto);

    expect(svc.salesArchiveService.archiveManualSale).toHaveBeenCalledWith(
      savedPurchase,
      pdf,
    );
    expect(svc.mailerService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [{ filename: 'tickets.pdf', content: pdf }],
      }),
    );
  });

  it('no archiva si buildTicketsPdf lanza, y createPurchase resuelve', async () => {
    const svc = buildService();
    svc.ticketsPdfService.buildTicketsPdf.mockRejectedValue(new Error('boom'));

    await expect(svc.createPurchase('e1', dto)).resolves.toBeDefined();
    expect(svc.salesArchiveService.archiveManualSale).not.toHaveBeenCalled();
  });

  it('resuelve aunque archiveManualSale rechace', async () => {
    const svc = buildService();
    svc.salesArchiveService.archiveManualSale.mockRejectedValue(
      new Error('disco lleno'),
    );

    await expect(svc.createPurchase('e1', dto)).resolves.toBeDefined();
  });

  it('archiva igual si el correo falla', async () => {
    const svc = buildService();
    svc.mailerService.send.mockRejectedValue(new Error('smtp'));

    await expect(svc.createPurchase('e1', dto)).resolves.toBeDefined();
    expect(svc.salesArchiveService.archiveManualSale).toHaveBeenCalledWith(
      savedPurchase,
      pdf,
    );
  });
});
