import { Test } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController', () => {
  const service = {
    pay: jest.fn().mockResolvedValue({ status: 'approved', statusDetail: 'ok', purchase: { tickets: [] } }),
    handleWebhook: jest.fn().mockResolvedValue(undefined),
  };
  let controller: PaymentsController;

  beforeEach(async () => {
    const ref = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: service }],
    }).compile();
    controller = ref.get(PaymentsController);
    jest.clearAllMocks();
  });

  it('POST pay delega en el servicio', async () => {
    const dto: any = { buyerEmail: 'a@b.cl', items: [], payment: { token: 't', installments: 1, paymentMethodId: 'visa' } };
    await controller.pay('e1', dto);
    expect(service.pay).toHaveBeenCalledWith('e1', dto);
  });

  it('POST webhook con type=payment delega handleWebhook', async () => {
    await controller.webhook({ type: 'payment', data: { id: 'mp1' } } as any);
    expect(service.handleWebhook).toHaveBeenCalledWith('mp1');
  });

  it('POST webhook de otro tipo se ignora', async () => {
    await controller.webhook({ type: 'other', data: { id: 'x' } } as any);
    expect(service.handleWebhook).not.toHaveBeenCalled();
  });
});
