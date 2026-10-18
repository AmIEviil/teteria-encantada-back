const create = jest.fn();
const get = jest.fn();
const preferenceCreate = jest.fn();
jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn(),
  Payment: jest.fn().mockImplementation(() => ({ create, get })),
  Preference: jest
    .fn()
    .mockImplementation(() => ({ create: preferenceCreate })),
}));

import { MercadoPagoService } from './mercadopago.service';

describe('MercadoPagoService', () => {
  beforeEach(() => {
    process.env.MP_ACCESS_TOKEN = 'test-token';
    process.env.PUBLIC_API_URL = 'https://api.test.cl';
    process.env.FRONTEND_URL = 'https://web.test.cl';
    create.mockReset();
    get.mockReset();
    preferenceCreate.mockReset();
  });

  it('charge mapea la respuesta de MP', async () => {
    create.mockResolvedValue({
      id: 123,
      status: 'approved',
      status_detail: 'accredited',
    });
    const svc = new MercadoPagoService();
    const res = await svc.charge({
      amount: 10000,
      token: 'tok',
      installments: 1,
      paymentMethodId: 'visa',
      payerEmail: 'a@b.cl',
      description: 'Tickets',
      externalReference: 'purchase-1',
      idempotencyKey: 'purchase-1',
    });
    expect(res).toEqual({
      id: '123',
      status: 'approved',
      statusDetail: 'accredited',
    });
    const callArgs = create.mock.calls[0][0];
    const body = callArgs.body;
    expect(body.transaction_amount).toBe(10000);
    expect(body.external_reference).toBe('purchase-1');
    expect(callArgs.requestOptions).toEqual({ idempotencyKey: 'purchase-1' });
  });

  it('charge omite requestOptions cuando no se pasa idempotencyKey', async () => {
    create.mockResolvedValue({
      id: 124,
      status: 'approved',
      status_detail: 'accredited',
    });
    const svc = new MercadoPagoService();
    await svc.charge({
      amount: 5000,
      token: 'tok',
      installments: 1,
      paymentMethodId: 'visa',
      payerEmail: 'a@b.cl',
      description: 'Tickets',
      externalReference: 'purchase-2',
    });
    expect(create.mock.calls[0][0].requestOptions).toBeUndefined();
  });

  it('charge manda los items como additional_info (snake_case) y los omite si no hay', async () => {
    create.mockResolvedValue({
      id: 125,
      status: 'approved',
      status_detail: '',
    });
    const svc = new MercadoPagoService();

    await svc.charge({
      amount: 25000,
      token: 'tok',
      installments: 1,
      paymentMethodId: 'visa',
      payerEmail: 'a@b.cl',
      description: 'Tickets',
      items: [{ id: 'tt1', title: 'General', quantity: 2, unitPrice: 10000 }],
      externalReference: 'purchase-3',
    });
    expect(create.mock.calls[0][0].body.additional_info).toEqual({
      items: [{ id: 'tt1', title: 'General', quantity: 2, unit_price: 10000 }],
    });

    await svc.charge({
      amount: 5000,
      token: 'tok',
      installments: 1,
      paymentMethodId: 'visa',
      payerEmail: 'a@b.cl',
      description: 'Tickets',
      externalReference: 'purchase-4',
    });
    expect(create.mock.calls[1][0].body.additional_info).toBeUndefined();
  });

  it('getPayment retorna external_reference', async () => {
    get.mockResolvedValue({
      id: 9,
      status: 'approved',
      status_detail: 'ok',
      external_reference: 'purchase-9',
    });
    const svc = new MercadoPagoService();
    const res = await svc.getPayment('9');
    expect(res.externalReference).toBe('purchase-9');
    expect(res.status).toBe('approved');
  });

  it('charge usa valores por defecto cuando MP omite status', async () => {
    delete process.env.MP_ACCESS_TOKEN;
    create.mockResolvedValue({ id: 200 });
    const svc = new MercadoPagoService();

    const res = await svc.charge({
      amount: 1000,
      token: 'tok',
      installments: 1,
      paymentMethodId: 'visa',
      payerEmail: 'a@b.cl',
      description: 'Tickets',
      externalReference: 'purchase-200',
    });

    expect(res).toEqual({ id: '200', status: 'unknown', statusDetail: '' });
  });

  it('getPayment usa valores por defecto cuando MP omite campos', async () => {
    get.mockResolvedValue({ id: 201 });
    const svc = new MercadoPagoService();

    const res = await svc.getPayment('201');

    expect(res).toEqual({
      id: '201',
      status: 'unknown',
      statusDetail: '',
      externalReference: null,
      details: {
        mpPaymentId: '201',
        status: 'unknown',
        approvedAt: null,
        amount: null,
        paymentMethodId: null,
        paymentTypeId: null,
        installments: null,
        payerId: null,
        payerName: null,
        payerEmail: null,
      },
    });
  });

  it('getPayment mapea details con todos los campos del pago', async () => {
    get.mockResolvedValue({
      id: 77,
      status: 'approved',
      status_detail: 'accredited',
      external_reference: 'purchase-77',
      date_approved: '2026-10-17T15:30:00.000-03:00',
      transaction_amount: 25000,
      payment_method_id: 'visa',
      payment_type_id: 'credit_card',
      installments: 3,
      // MP a veces entrega el id del pagador como número.
      payer: {
        id: 123456,
        first_name: ' Ana ',
        last_name: 'Pérez',
        email: 'ana@mail.cl',
      },
    });
    const svc = new MercadoPagoService();

    const res = await svc.getPayment('77');

    expect(res.id).toBe('77');
    expect(res.status).toBe('approved');
    expect(res.statusDetail).toBe('accredited');
    expect(res.externalReference).toBe('purchase-77');
    expect(res.details).toEqual({
      mpPaymentId: '77',
      status: 'approved',
      approvedAt: new Date('2026-10-17T18:30:00.000Z'),
      amount: 25000,
      paymentMethodId: 'visa',
      paymentTypeId: 'credit_card',
      installments: 3,
      payerId: '123456',
      payerName: 'Ana Pérez',
      payerEmail: 'ana@mail.cl',
    });
  });

  it('getPayment deja approvedAt en null si date_approved no es una fecha valida', async () => {
    get.mockResolvedValue({
      id: 79,
      status: 'approved',
      status_detail: 'accredited',
      external_reference: 'purchase-79',
      date_approved: 'not-a-date',
    });
    const svc = new MercadoPagoService();

    const res = await svc.getPayment('79');

    expect(res.details.approvedAt).toBeNull();
  });

  it('getPayment deja en null los datos del pagador y la aprobación si MP no los trae', async () => {
    get.mockResolvedValue({
      id: 78,
      status: 'approved',
      status_detail: 'accredited',
      external_reference: 'purchase-78',
      transaction_amount: 10000,
      payment_method_id: 'debvisa',
      payment_type_id: 'debit_card',
      installments: 1,
    });
    const svc = new MercadoPagoService();

    const res = await svc.getPayment('78');

    expect(res.details).toEqual({
      mpPaymentId: '78',
      status: 'approved',
      approvedAt: null,
      amount: 10000,
      paymentMethodId: 'debvisa',
      paymentTypeId: 'debit_card',
      installments: 1,
      payerId: null,
      payerName: null,
      payerEmail: null,
    });
  });

  it('getPayment deja payerName en null si nombre y apellido vienen vacíos', async () => {
    get.mockResolvedValue({
      id: 79,
      status: 'approved',
      payer: { id: 'u-1', first_name: '  ', last_name: '', email: 'x@y.cl' },
    });
    const svc = new MercadoPagoService();

    const res = await svc.getPayment('79');

    expect(res.details.payerId).toBe('u-1');
    expect(res.details.payerName).toBeNull();
    expect(res.details.payerEmail).toBe('x@y.cl');
  });

  const preferenceInput = () => ({
    items: [
      {
        id: 'tt1',
        title: 'VIP - Ana Pérez - 01/08/2026 10:00',
        quantity: 1,
        unitPrice: 10000,
      },
    ],
    payerEmail: 'a@b.cl',
    externalReference: 'purchase-1',
    expiresAt: new Date('2026-08-06T21:15:00.000Z'),
  });

  it('createPreference mapea la respuesta de MP', async () => {
    preferenceCreate.mockResolvedValue({
      id: 'pref-1',
      init_point: 'https://mp.test/checkout/pref-1',
    });
    const svc = new MercadoPagoService();

    const res = await svc.createPreference(preferenceInput());

    expect(res).toEqual({
      id: 'pref-1',
      initPoint: 'https://mp.test/checkout/pref-1',
    });
  });

  it('createPreference arma el body que necesita el webhook y el QR', async () => {
    preferenceCreate.mockResolvedValue({
      id: 'pref-1',
      init_point: 'https://mp.test/checkout/pref-1',
    });
    const svc = new MercadoPagoService();

    await svc.createPreference(preferenceInput());

    const body = preferenceCreate.mock.calls[0][0].body;

    // external_reference es lo que handleWebhook usa para encontrar la compra.
    expect(body.external_reference).toBe('purchase-1');
    expect(body.notification_url).toBe(
      'https://api.test.cl/public/mercadopago/webhook',
    );
    expect(body.back_urls.success).toBe(
      'https://web.test.cl/publico/pago/resultado',
    );
    expect(body.back_urls.pending).toBe(body.back_urls.success);
    expect(body.back_urls.failure).toBe(body.back_urls.success);
    expect(body.auto_return).toBe('approved');
    expect(body.binary_mode).toBe(true);
    expect(body.payer.email).toBe('a@b.cl');
    expect(body.items[0].currency_id).toBe('CLP');
    expect(body.items[0].unit_price).toBe(10000);
  });

  it('createPreference marca la expiración con offset numérico', async () => {
    preferenceCreate.mockResolvedValue({
      id: 'pref-1',
      init_point: 'https://mp.test/checkout/pref-1',
    });
    const svc = new MercadoPagoService();

    await svc.createPreference(preferenceInput());

    const body = preferenceCreate.mock.calls[0][0].body;
    expect(body.expires).toBe(true);
    // MP rechaza el sufijo 'Z': exige offset numérico.
    expect(body.expiration_date_to).toBe('2026-08-06T21:15:00.000-00:00');
    expect(body.expiration_date_from).toMatch(/-00:00$/);
  });

  it('createPreference omite auto_return cuando el front no es https', async () => {
    process.env.FRONTEND_URL = 'http://localhost:5173';
    preferenceCreate.mockResolvedValue({
      id: 'pref-1',
      init_point: 'https://mp.test/checkout/pref-1',
    });
    const svc = new MercadoPagoService();

    await svc.createPreference(preferenceInput());

    // MP rechaza la preferencia entera si auto_return apunta a una URL no
    // pública; en desarrollo se prefiere no volver automáticamente.
    const body = preferenceCreate.mock.calls[0][0].body;
    expect(body.auto_return).toBeUndefined();
  });
});
