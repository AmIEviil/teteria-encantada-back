import { SalesArchiveService } from './sales-archive.service';
import { SalePaymentInfo } from './sales-archive.types';
import { EventPurchase } from '../events/entities/event-purchase.entity';

const payment: SalePaymentInfo = {
  mpPaymentId: '123',
  status: 'approved',
  approvedAt: new Date('2026-11-01T02:30:00Z'),
  amount: 24000,
  paymentMethodId: 'visa',
  paymentTypeId: 'credit_card',
  installments: 1,
  payerId: '987',
  payerName: 'Ana Pérez',
  payerEmail: 'ana@mail.cl',
};

const tickets = [
  {
    eventTitle: 'Coraline',
    ticketTypeName: 'General',
    spectacleType: 'Teatro',
    attendeeName: 'Ana Pérez',
    attendanceDate: '2026-11-07',
    sessionTime: '19:00',
    customTemplateUrl: null,
    price: 12000,
  },
];

const purchase = {
  id: 'p-1',
  buyerEmail: 'ana@mail.cl',
  mpPaymentId: '123',
} as EventPurchase;

describe('SalesArchiveService', () => {
  let service: SalesArchiveService;
  let repo: { update: jest.Mock };
  let storage: { putObject: jest.Mock };
  const pdf = Buffer.from('%PDF-tickets');

  beforeEach(() => {
    repo = { update: jest.fn().mockResolvedValue(undefined) };
    storage = { putObject: jest.fn().mockResolvedValue(undefined) };
    service = new SalesArchiveService(repo as never, storage as never);
  });

  afterEach(() => jest.useRealTimers());

  it('guarda tickets y comprobante en la carpeta del mes de Santiago', async () => {
    await service.archivePaidSale(purchase, pdf, payment, 'Coraline', tickets);

    expect(storage.putObject).toHaveBeenCalledWith(
      'ventas/2026-10/123-tickets.pdf',
      pdf,
      'application/pdf',
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      'ventas/2026-10/123-comprobante.pdf',
      expect.any(Buffer),
      'application/pdf',
    );
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledWith('p-1', {
      ticketsFileKey: 'ventas/2026-10/123-tickets.pdf',
      receiptFileKey: 'ventas/2026-10/123-comprobante.pdf',
      mpPayerId: '987',
      mpPayerName: 'Ana Pérez',
      mpPaymentMethod: 'visa',
      paidAt: payment.approvedAt,
    });
  });

  it('sin pago solo guarda tickets y no toca datos del pagador', async () => {
    await service.archivePaidSale(purchase, pdf, null, 'Coraline', tickets);

    expect(storage.putObject).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledWith('p-1', {
      ticketsFileKey: expect.stringMatching(/-tickets\.pdf$/),
    });
  });

  it('si falla el comprobante igual deja los tickets y no rechaza', async () => {
    storage.putObject.mockImplementation((key: string) => {
      if (key.endsWith('-comprobante.pdf')) {
        return Promise.reject(new Error('ENOSPC'));
      }
      return Promise.resolve();
    });

    await expect(
      service.archivePaidSale(purchase, pdf, payment, 'Coraline', tickets),
    ).resolves.toBeUndefined();

    const [, data] = repo.update.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(data.ticketsFileKey).toBe('ventas/2026-10/123-tickets.pdf');
    expect(data).not.toHaveProperty('receiptFileKey');
  });

  it('si el disco falla del todo no rechaza', async () => {
    storage.putObject.mockRejectedValue(new Error('EACCES'));

    await expect(
      service.archivePaidSale(purchase, pdf, payment, 'Coraline', tickets),
    ).resolves.toBeUndefined();
  });

  it('si update lanza no rechaza', async () => {
    repo.update.mockRejectedValue(new Error('db caída'));

    await expect(
      service.archivePaidSale(purchase, pdf, payment, 'Coraline', tickets),
    ).resolves.toBeUndefined();
  });

  it('sin mpPaymentId no escribe nada', async () => {
    await service.archivePaidSale(
      { ...purchase, mpPaymentId: null } as EventPurchase,
      pdf,
      payment,
      'Coraline',
      tickets,
    );

    expect(storage.putObject).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('archiveManualSale usa el mes actual de Santiago y el id de compra', async () => {
    jest.useFakeTimers().setSystemTime(Date.parse('2026-11-01T02:30:00Z'));

    await service.archiveManualSale(purchase, pdf);

    expect(storage.putObject).toHaveBeenCalledWith(
      'ventas/2026-10/p-1-tickets.pdf',
      pdf,
      'application/pdf',
    );
    expect(repo.update).toHaveBeenCalledWith('p-1', {
      ticketsFileKey: 'ventas/2026-10/p-1-tickets.pdf',
    });
  });

  it('archiveManualSale no rechaza si el disco falla', async () => {
    storage.putObject.mockRejectedValue(new Error('ENOSPC'));

    await expect(
      service.archiveManualSale(purchase, pdf),
    ).resolves.toBeUndefined();
  });
});
