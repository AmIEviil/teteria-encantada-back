import { PDFDocument } from 'pdf-lib';
import { buildReceiptPdf } from './receipt-pdf';
import { SalePaymentInfo } from './sales-archive.types';

const payment: SalePaymentInfo = {
  mpPaymentId: '123',
  status: 'approved',
  approvedAt: new Date('2026-11-01T02:30:00Z'),
  amount: 24000,
  paymentMethodId: 'visa',
  paymentTypeId: 'credit_card',
  installments: 1,
  payerId: '987',
  payerName: 'Ana Pérez 😀',
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

describe('buildReceiptPdf', () => {
  it('genera un PDF válido con al menos una página', async () => {
    const buf = await buildReceiptPdf({
      purchaseId: 'p-1',
      buyerEmail: 'ana@mail.cl',
      eventTitle: 'Coraline',
      payment,
      tickets,
    });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('no lanza con pagador y fecha nulos', async () => {
    await expect(
      buildReceiptPdf({
        purchaseId: 'p-1',
        buyerEmail: 'ana@mail.cl',
        eventTitle: 'Coraline',
        payment: {
          ...payment,
          payerId: null,
          payerName: null,
          approvedAt: null,
          amount: null,
          installments: null,
          paymentMethodId: null,
        },
        tickets,
      }),
    ).resolves.toBeInstanceOf(Buffer);
  });
});
