import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway', () => {
  it('emite reservations:changed cuando hay servidor', () => {
    const gateway = new RealtimeGateway();
    const emit = jest.fn();
    (gateway as unknown as { server: { emit: jest.Mock } }).server = { emit };
    gateway.emitReservationsChanged({ tableId: 't1', reason: 'CONFIRMED' });
    expect(emit).toHaveBeenCalledWith('reservations:changed', {
      tableId: 't1',
      reason: 'CONFIRMED',
    });
  });

  it('no falla sin servidor', () => {
    const gateway = new RealtimeGateway();
    expect(() =>
      gateway.emitReservationsChanged({ reason: 'NO_RESPONSE' }),
    ).not.toThrow();
  });
});
