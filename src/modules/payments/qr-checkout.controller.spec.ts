import { QrCheckoutController } from './qr-checkout.controller';

describe('QrCheckoutController', () => {
  const service = {
    createQrCheckout: jest.fn(),
    getQrCheckout: jest.fn(),
    cancelQrCheckout: jest.fn(),
  };
  const build = () => new QrCheckoutController(service as any);

  beforeEach(() => jest.clearAllMocks());

  it('create delega en PaymentsService con el eventId de la ruta', async () => {
    service.createQrCheckout.mockResolvedValue({ purchaseId: 'p1' });
    const dto = { buyerEmail: 'b@t.cl', items: [] } as any;

    const res = await build().create('e1', dto);

    expect(service.createQrCheckout).toHaveBeenCalledWith('e1', dto);
    expect(res).toEqual({ purchaseId: 'p1' });
  });

  it('get delega el eventId y el purchaseId de la ruta', async () => {
    service.getQrCheckout.mockResolvedValue({ status: 'PENDING' });

    const res = await build().get('e1', 'p1');

    expect(service.getQrCheckout).toHaveBeenCalledWith('e1', 'p1');
    expect(res).toEqual({ status: 'PENDING' });
  });

  it('cancel delega el eventId y el purchaseId de la ruta', async () => {
    service.cancelQrCheckout.mockResolvedValue({ status: 'CANCELLED' });

    const res = await build().cancel('e1', 'p1');

    expect(service.cancelQrCheckout).toHaveBeenCalledWith('e1', 'p1');
    expect(res).toEqual({ status: 'CANCELLED' });
  });
});
