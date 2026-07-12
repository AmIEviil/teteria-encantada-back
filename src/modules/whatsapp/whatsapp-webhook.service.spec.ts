import { WhatsappWebhookService } from './whatsapp-webhook.service';

describe('WhatsappWebhookService', () => {
  const buildDeps = () => {
    const reservationRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'res-1', tableId: 'table-1' }),
    };
    const reservationsService = {
      applyConfirmationDecision: jest
        .fn()
        .mockResolvedValue({ tableId: 'table-1' }),
    };
    const realtimeGateway = { emitReservationsChanged: jest.fn() };
    return { reservationRepo, reservationsService, realtimeGateway };
  };

  const buildPayload = (from: string, buttonPayload: string) => ({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from,
                  type: 'button',
                  button: { payload: buttonPayload, text: 'Sí' },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  it('confirma la reserva y emite señal cuando el cliente responde Sí', async () => {
    const { reservationRepo, reservationsService, realtimeGateway } =
      buildDeps();
    const service = new WhatsappWebhookService(
      reservationRepo as never,
      reservationsService as never,
      realtimeGateway as never,
    );

    await service.handleIncoming(buildPayload('56999999999', 'CONFIRM_YES'));

    expect(reservationsService.applyConfirmationDecision).toHaveBeenCalledWith(
      'res-1',
      'CONFIRM',
    );
    expect(realtimeGateway.emitReservationsChanged).toHaveBeenCalledWith({
      tableId: 'table-1',
      reason: 'CONFIRMED',
    });
  });

  it('ignora respuestas no interpretables sin tocar la reserva', async () => {
    const { reservationRepo, reservationsService, realtimeGateway } =
      buildDeps();
    const service = new WhatsappWebhookService(
      reservationRepo as never,
      reservationsService as never,
      realtimeGateway as never,
    );

    await service.handleIncoming(buildPayload('56999999999', 'quizas'));

    expect(
      reservationsService.applyConfirmationDecision,
    ).not.toHaveBeenCalled();
    expect(realtimeGateway.emitReservationsChanged).not.toHaveBeenCalled();
  });
});
