import { BadRequestException } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  const webhookService = { handleIncoming: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    controller = new WhatsappController(webhookService as never);
    process.env.WHATSAPP_VERIFY_TOKEN = 'secret';
  });

  afterEach(() => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
  });

  it('verify devuelve challenge con token correcto', () => {
    expect(controller.verify('subscribe', 'secret', 'CHAL')).toBe('CHAL');
  });

  it('verify rechaza token invalido', () => {
    expect(() => controller.verify('subscribe', 'bad', 'CHAL')).toThrow(
      BadRequestException,
    );
  });

  it('receive delega en el webhook', async () => {
    const result = await controller.receive({ foo: 'bar' });
    expect(webhookService.handleIncoming).toHaveBeenCalledWith({ foo: 'bar' });
    expect(result).toEqual({ received: true });
  });
});
