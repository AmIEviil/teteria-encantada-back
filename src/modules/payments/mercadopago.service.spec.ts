const create = jest.fn();
const get = jest.fn();
jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn(),
  Payment: jest.fn().mockImplementation(() => ({ create, get })),
}));

import { MercadoPagoService } from './mercadopago.service';

describe('MercadoPagoService', () => {
  beforeEach(() => {
    process.env.MP_ACCESS_TOKEN = 'test-token';
    create.mockReset();
    get.mockReset();
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
});
