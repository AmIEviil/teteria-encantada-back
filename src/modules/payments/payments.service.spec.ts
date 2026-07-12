import { PaymentsService } from './payments.service';
import { EventPurchaseStatus } from '../events/entities/event-purchase.entity';

interface UpdateResult {
  affected: number;
}

// Repo fake que simula update condicional real de TypeORM: sólo aplica el
// patch si TODAS las claves del criteria calzan con el valor guardado
// actualmente, y reporta cuántas filas quedaron afectadas (0 o 1). Esto es
// lo que permite probar que fulfill() es realmente race-safe: dos llamadas
// concurrentes con el mismo criteria {id, status: PENDING} sólo pueden ganar
// una vez, la segunda ve affected === 0.
const makePurchaseRepo = (initial?: Record<string, unknown>) => {
  let value: Record<string, unknown> | null = initial
    ? { id: 'p1', ...initial }
    : null;

  return {
    create: (v: Record<string, unknown>) => ({ ...v }),
    save: jest.fn(async (v: Record<string, unknown>) => {
      value = { id: 'p1', ...(value ?? {}), ...v };
      return value;
    }),
    findOne: jest.fn(async () => (value ? { ...value } : null)),
    update: jest.fn(
      async (
        criteria: Record<string, unknown> | string,
        patch: Record<string, unknown>,
      ): Promise<UpdateResult> => {
        if (!value) return { affected: 0 };
        if (typeof criteria === 'string') {
          // update(id, patch) — sin condición de estado (p.ej. setear mpPaymentId).
          value = { ...value, ...patch };
          return { affected: 1 };
        }
        const matches = Object.entries(criteria).every(
          ([k, v]) => (value as Record<string, unknown>)[k] === v,
        );
        if (!matches) return { affected: 0 };
        value = { ...value, ...patch };
        return { affected: 1 };
      },
    ),
    getValue: () => value,
  };
};

describe('PaymentsService', () => {
  let purchaseRepo: ReturnType<typeof makePurchaseRepo>;
  let ticketRepo: { update: jest.Mock };
  const events = {
    quotePublicPurchase: jest.fn().mockResolvedValue(10000),
    createPublicTickets: jest.fn().mockResolvedValue({
      eventId: 'e1',
      eventTitle: 'Ev',
      buyerEmail: 'b@t.cl',
      total: 10000,
      tickets: [
        {
          id: 't1',
          ticketTypeName: 'VIP',
          attendeeFirstName: 'A',
          attendeeLastName: 'B',
          attendanceDate: '2026-08-01',
          sessionId: null,
          price: 10000,
          menuExtraPrice: 0,
          includesDetails: null,
          menuSummary: null,
        },
      ],
    }),
    findOne: jest.fn().mockResolvedValue({
      id: 'e1',
      title: 'Ev',
      ticketTypes: [
        { id: 'tt1', name: 'VIP', customTicketTemplateUrl: 'https://tpl/vip.png' },
      ],
    }),
  };
  const mp = { charge: jest.fn(), getPayment: jest.fn() };
  const mailer = { send: jest.fn().mockResolvedValue(undefined) };
  const pdf = { buildTicketsPdf: jest.fn().mockResolvedValue(Buffer.from('PDF')) };

  const build = () =>
    new PaymentsService(
      purchaseRepo as any,
      ticketRepo as any,
      events as any,
      mp as any,
      mailer as any,
      pdf as any,
    );

  const basePayInput = {
    buyerEmail: 'b@t.cl',
    items: [
      {
        ticketTypeId: 'tt1',
        attendeeFirstName: 'A',
        attendeeLastName: 'B',
        attendanceDate: new Date('2026-08-01'),
      },
    ],
    payment: { token: 'tok', installments: 1, paymentMethodId: 'visa' },
  };

  beforeEach(() => {
    purchaseRepo = makePurchaseRepo();
    ticketRepo = { update: jest.fn().mockResolvedValue(undefined) };
    jest.clearAllMocks();
  });

  describe('pay', () => {
    it('approved: crea tickets una vez, envía correo una vez y marca la compra PAID', async () => {
      mp.charge.mockResolvedValue({ id: 'mp1', status: 'approved', statusDetail: 'accredited' });
      const svc = build();

      const res = await svc.pay('e1', basePayInput);

      expect(res.status).toBe('approved');
      expect(res.purchase?.tickets.length).toBe(1);
      expect(events.createPublicTickets).toHaveBeenCalledTimes(1);
      expect(mailer.send).toHaveBeenCalledTimes(1);
      expect(purchaseRepo.getValue()?.status).toBe(EventPurchaseStatus.PAID);
      expect(ticketRepo.update).toHaveBeenCalledWith(['t1'], { purchaseId: 'p1' });
    });

    it('rejected: no crea tickets, no envía correo, y marca la compra REJECTED', async () => {
      mp.charge.mockResolvedValue({ id: 'mp2', status: 'rejected', statusDetail: 'cc_rejected' });
      const svc = build();

      const res = await svc.pay('e1', basePayInput);

      expect(res.status).toBe('rejected');
      expect(res.purchase).toBeNull();
      expect(events.createPublicTickets).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
      expect(purchaseRepo.getValue()?.status).toBe(EventPurchaseStatus.REJECTED);
    });

    it('pending/in_process: no crea tickets, no envía correo, y la compra sigue PENDING', async () => {
      mp.charge.mockResolvedValue({ id: 'mp3', status: 'in_process', statusDetail: 'pending_review' });
      const svc = build();

      const res = await svc.pay('e1', basePayInput);

      expect(res.status).toBe('pending');
      expect(res.purchase).toBeNull();
      expect(events.createPublicTickets).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
      expect(purchaseRepo.getValue()?.status).toBe(EventPurchaseStatus.PENDING);
    });

    it("status desconocido ('unknown' u otro no reconocido) se trata como rechazado, nunca fulfilla", async () => {
      mp.charge.mockResolvedValue({ id: 'mp4', status: 'unknown', statusDetail: '' });
      const svc = build();

      const res = await svc.pay('e1', basePayInput);

      expect(res.status).toBe('rejected');
      expect(events.createPublicTickets).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
      expect(purchaseRepo.getValue()?.status).toBe(EventPurchaseStatus.REJECTED);
    });

    it('envía el idempotencyKey de MP igual al id de la compra (externalReference)', async () => {
      mp.charge.mockResolvedValue({ id: 'mp1', status: 'approved', statusDetail: 'ok' });
      const svc = build();

      await svc.pay('e1', basePayInput);

      const chargeArgs = mp.charge.mock.calls[0][0];
      expect(chargeArgs.externalReference).toBe('p1');
      expect(chargeArgs.idempotencyKey).toBe('p1');
    });

    it('usa el template por ticketTypeId (no por nombre) y consulta el evento una sola vez', async () => {
      mp.charge.mockResolvedValue({ id: 'mp1', status: 'approved', statusDetail: 'ok' });
      const svc = build();

      await svc.pay('e1', basePayInput);

      expect(events.findOne).toHaveBeenCalledTimes(1);
      const pdfInputs = pdf.buildTicketsPdf.mock.calls[0][0];
      expect(pdfInputs[0].customTemplateUrl).toBe('https://tpl/vip.png');
    });

    it('si el envío de correo falla, los tickets ya creados y el estado PAID se mantienen (no se revierte ni lanza)', async () => {
      mp.charge.mockResolvedValue({ id: 'mp1', status: 'approved', statusDetail: 'ok' });
      mailer.send.mockRejectedValueOnce(new Error('smtp down'));
      const svc = build();

      const res = await svc.pay('e1', basePayInput);

      expect(res.status).toBe('approved');
      expect(res.purchase?.tickets.length).toBe(1);
      expect(purchaseRepo.getValue()?.status).toBe(EventPurchaseStatus.PAID);
      expect(events.createPublicTickets).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleWebhook', () => {
    it('fulfill es idempotente: si ya está PAID (pay() inline ya fulfilló), el webhook no recrea', async () => {
      mp.charge.mockResolvedValue({ id: 'mp1', status: 'approved', statusDetail: 'ok' });
      const svc = build();

      await svc.pay('e1', basePayInput);
      events.createPublicTickets.mockClear();
      mailer.send.mockClear();

      mp.getPayment.mockResolvedValue({
        id: 'mp1',
        status: 'approved',
        statusDetail: 'ok',
        externalReference: 'p1',
      });
      await svc.handleWebhook('mp1');

      expect(events.createPublicTickets).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('webhook approved para una compra PENDING la fulfilla', async () => {
      purchaseRepo = makePurchaseRepo({
        eventId: 'e1',
        buyerEmail: 'b@t.cl',
        itemsSnapshot: [{ ticketTypeId: 'tt1', sessionId: null, attendanceDate: '2026-08-01', attendeeFirstName: 'A', attendeeLastName: 'B', menuSelection: null }],
        status: EventPurchaseStatus.PENDING,
      });
      const svc = build();
      mp.getPayment.mockResolvedValue({
        id: 'mp1',
        status: 'approved',
        statusDetail: 'ok',
        externalReference: 'p1',
      });

      await svc.handleWebhook('mp1');

      expect(events.createPublicTickets).toHaveBeenCalledTimes(1);
      expect(mailer.send).toHaveBeenCalledTimes(1);
      expect(purchaseRepo.getValue()?.status).toBe(EventPurchaseStatus.PAID);
    });

    it('webhook sin externalReference no hace nada', async () => {
      const svc = build();
      mp.getPayment.mockResolvedValue({
        id: 'mp1',
        status: 'approved',
        statusDetail: 'ok',
        externalReference: null,
      });

      await svc.handleWebhook('mp1');

      expect(events.createPublicTickets).not.toHaveBeenCalled();
    });
  });

  describe('concurrencia de fulfill', () => {
    it('dos fulfill compitiendo por el mismo purchaseId (p.ej. pay() inline y webhook) crean tickets y envían correo UNA sola vez', async () => {
      purchaseRepo = makePurchaseRepo({
        eventId: 'e1',
        buyerEmail: 'b@t.cl',
        itemsSnapshot: [{ ticketTypeId: 'tt1', sessionId: null, attendanceDate: '2026-08-01', attendeeFirstName: 'A', attendeeLastName: 'B', menuSelection: null }],
        status: EventPurchaseStatus.PENDING,
      });
      const svc = build();

      // Forzamos el resultado de la carrera explícitamente: la primera
      // llamada al update condicional "gana" (affected: 1), la segunda
      // "pierde" (affected: 0) — exactamente lo que pasaría si dos
      // procesos (webhook duplicado + pay() inline) intentan reclamar la
      // misma fila PENDING al mismo tiempo.
      (purchaseRepo.update as jest.Mock)
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 0 });

      const [r1, r2] = await Promise.all([
        (svc as any).fulfill('p1'),
        (svc as any).fulfill('p1'),
      ]);

      const wins = [r1, r2].filter((r) => r !== null);
      expect(wins.length).toBe(1);
      expect(events.createPublicTickets).toHaveBeenCalledTimes(1);
      expect(mailer.send).toHaveBeenCalledTimes(1);
    });
  });
});
