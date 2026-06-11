import { WhatsappService } from './whatsapp.service';

describe('WhatsappService', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      WHATSAPP_API_TOKEN: 'test-token',
      WHATSAPP_PHONE_NUMBER_ID: '123456',
      WHATSAPP_TEMPLATE_NAME: 'reserva_recordatorio',
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  it('envía la plantilla al endpoint correcto con el token', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: 'wamid.123' }] }), {
          status: 200,
        }),
      );

    const service = new WhatsappService();
    await service.sendReminderTemplate('+56999999999', 'Ana');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v20.0/123456/messages');
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-token',
    );
    const body = JSON.parse(init?.body as string);
    expect(body.to).toBe('+56999999999');
    expect(body.template.name).toBe('reserva_recordatorio');
  });

  it('lanza si la respuesta no es ok', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('error', { status: 400 }));

    const service = new WhatsappService();
    await expect(
      service.sendReminderTemplate('+56999999999', 'Ana'),
    ).rejects.toThrow();
  });
});
