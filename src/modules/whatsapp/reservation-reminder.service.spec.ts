import { ReservationReminderService } from './reservation-reminder.service';
import { ReservationConfirmationStatus } from '../reservations/entities/reservation.entity';

describe('ReservationReminderService', () => {
  const buildDeps = (pending: unknown[] = [], stale: unknown[] = []) => {
    const reservationRepo = {
      find: jest
        .fn()
        .mockResolvedValueOnce(pending) // primera llamada: recordatorios
        .mockResolvedValueOnce(stale), // segunda llamada: no-respuesta
      save: jest.fn().mockImplementation((r) => Promise.resolve(r)),
      update: jest.fn().mockResolvedValue({ affected: stale.length }),
    };
    const whatsappService = { sendReminderTemplate: jest.fn().mockResolvedValue(undefined) };
    const realtimeGateway = { emitReservationsChanged: jest.fn() };
    return { reservationRepo, whatsappService, realtimeGateway };
  };

  it('envía recordatorio y marca PENDING para reservas dentro de la próxima hora', async () => {
    const reservation = {
      id: 'res-1',
      tableId: 'table-1',
      phone: '+56999999999',
      holderName: 'Ana',
      confirmationStatus: ReservationConfirmationStatus.NOT_SENT,
    };
    const { reservationRepo, whatsappService, realtimeGateway } = buildDeps([reservation]);
    const service = new ReservationReminderService(
      reservationRepo as never,
      whatsappService as never,
      realtimeGateway as never,
    );

    await service.sendDueReminders();

    expect(whatsappService.sendReminderTemplate).toHaveBeenCalledWith('+56999999999', 'Ana');
    const saved = reservationRepo.save.mock.calls[0][0];
    expect(saved.confirmationStatus).toBe(ReservationConfirmationStatus.PENDING);
    expect(saved.confirmationSentAt).toBeInstanceOf(Date);
    expect(realtimeGateway.emitReservationsChanged).toHaveBeenCalledWith({
      tableId: 'table-1',
      reason: 'REMINDER_SENT',
    });
  });

  it('no envía a reservas sin teléfono', async () => {
    const reservation = {
      id: 'res-2',
      tableId: 'table-2',
      phone: null,
      holderName: 'Beto',
      confirmationStatus: ReservationConfirmationStatus.NOT_SENT,
    };
    const { reservationRepo, whatsappService } = buildDeps([reservation]);
    const service = new ReservationReminderService(
      reservationRepo as never,
      whatsappService as never,
      { emitReservationsChanged: jest.fn() } as never,
    );

    await service.sendDueReminders();

    expect(whatsappService.sendReminderTemplate).not.toHaveBeenCalled();
    expect(reservationRepo.save).not.toHaveBeenCalled();
  });
});
