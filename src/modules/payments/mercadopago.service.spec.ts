const create = jest.fn();
const get = jest.fn();
const preferenceCreate = jest.fn();
jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn(),
  Payment: jest.fn().mockImplementation(() => ({ create, get })),
  Preference: jest.fn().mockImplementation(() => ({ create: preferenceCreate })),
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
    });
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
