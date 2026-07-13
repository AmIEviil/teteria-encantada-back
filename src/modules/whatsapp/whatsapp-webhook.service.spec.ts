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

  const buildService = (deps = buildDeps()) => ({
    deps,
    service: new WhatsappWebhookService(
      deps.reservationRepo as never,
      deps.reservationsService as never,
      deps.realtimeGateway as never,
    ),
  });

  const withMessage = (message: Record<string, unknown>) => ({
    entry: [{ changes: [{ value: { messages: [message] } }] }],
  });

  it.each([
    ['payload nulo', null],
    ['payload sin entry', {}],
    ['entry sin changes', { entry: [{}] }],
    ['change sin messages', { entry: [{ changes: [{ value: {} }] }] }],
    ['change sin value', { entry: [{ changes: [{}] }] }],
  ])('no procesa nada con %s', async (_label, payload) => {
    const { deps, service } = buildService();

    await service.handleIncoming(payload);

    expect(deps.reservationRepo.findOne).not.toHaveBeenCalled();
  });

  it('ignora mensajes sin remitente', async () => {
    const { deps, service } = buildService();

    await service.handleIncoming(withMessage({ text: { body: 'si' } }));

    expect(deps.reservationRepo.findOne).not.toHaveBeenCalled();
  });

  it('lee la decision desde el boton interactivo', async () => {
    const { deps, service } = buildService();

    await service.handleIncoming(
      withMessage({
        from: '56999999999',
        interactive: { button_reply: { id: 'CONFIRM_NO', title: 'No' } },
      }),
    );

    expect(
      deps.reservationsService.applyConfirmationDecision,
    ).toHaveBeenCalledWith('res-1', 'DECLINE');
    expect(deps.realtimeGateway.emitReservationsChanged).toHaveBeenCalledWith({
      tableId: 'table-1',
      reason: 'DECLINED',
    });
  });

  it('lee la decision desde el texto libre', async () => {
    const { deps, service } = buildService();

    await service.handleIncoming(
      withMessage({ from: '56999999999', text: { body: 'Sí' } }),
    );

    expect(
      deps.reservationsService.applyConfirmationDecision,
    ).toHaveBeenCalledWith('res-1', 'CONFIRM');
  });

  it('ignora mensajes sin contenido de texto', async () => {
    const { deps, service } = buildService();

    await service.handleIncoming(withMessage({ from: '56999999999' }));

    expect(deps.reservationRepo.findOne).not.toHaveBeenCalled();
  });

  it('ignora cuando no hay reserva PENDING para el telefono', async () => {
    const deps = buildDeps();
    deps.reservationRepo.findOne.mockResolvedValue(null);
    const { service } = buildService(deps);

    await service.handleIncoming(buildPayload('56999999999', 'CONFIRM_YES'));

    expect(
      deps.reservationsService.applyConfirmationDecision,
    ).not.toHaveBeenCalled();
  });

  it('busca la reserva por todas las variantes del telefono', async () => {
    const deps = buildDeps();
    const { service } = buildService(deps);

    await service.handleIncoming(buildPayload('+56 9 9999 9999', 'si'));

    const where = deps.reservationRepo.findOne.mock.calls[0][0].where as Array<{
      phone: string;
    }>;
    expect(where.map((clause) => clause.phone)).toEqual([
      '+56 9 9999 9999',
      '56999999999',
      '+56999999999',
    ]);
  });
});
