import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReservationsService } from './reservations.service';
import {
  Reservation,
  ReservationStatus,
  ReservationConfirmationStatus,
} from './entities/reservation.entity';
import { ReservationWeeklySchedule } from './entities/reservation-weekly-schedule.entity';
import {
  RestaurantTable,
  TableStatus,
} from '../layouts/entities/restaurant-table.entity';
import { Order } from '../orders/entities/order.entity';

describe('ReservationsService confirmation', () => {
  const buildReservation = (): Reservation =>
    ({
      id: 'res-1',
      tableId: 'table-1',
      status: ReservationStatus.ACTIVE,
      confirmationStatus: ReservationConfirmationStatus.PENDING,
      confirmationSentAt: new Date('2026-06-10T11:00:00Z'),
      confirmationRespondedAt: null,
    }) as Reservation;

  const makeService = async (reservation: Reservation) => {
    const reservationRepo = {
      findOne: jest.fn().mockResolvedValue(reservation),
      save: jest.fn((r: Reservation) => Promise.resolve(r)),
      count: jest.fn().mockResolvedValue(0),
    };
    const tableRepo = {
      findOneBy: jest
        .fn()
        .mockResolvedValue({ id: 'table-1', status: TableStatus.RESERVED }),
      save: jest.fn((t: RestaurantTable) => Promise.resolve(t)),
    };
    const orderRepo = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn(),
    };
    const scheduleRepo = {};

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: getRepositoryToken(Reservation), useValue: reservationRepo },
        {
          provide: getRepositoryToken(ReservationWeeklySchedule),
          useValue: scheduleRepo,
        },
        { provide: getRepositoryToken(RestaurantTable), useValue: tableRepo },
        { provide: getRepositoryToken(Order), useValue: orderRepo },
      ],
    }).compile();

    return {
      service: moduleRef.get(ReservationsService),
      reservationRepo,
      tableRepo,
    };
  };

  it('confirmReservation marca CONFIRMED y devuelve el tableId', async () => {
    const reservation = buildReservation();
    const { service, reservationRepo } = await makeService(reservation);

    const result = await service.applyConfirmationDecision('res-1', 'CONFIRM');

    expect(result.tableId).toBe('table-1');
    const saved = reservationRepo.save.mock.calls[0][0];
    expect(saved.confirmationStatus).toBe(
      ReservationConfirmationStatus.CONFIRMED,
    );
    expect(saved.confirmationRespondedAt).toBeInstanceOf(Date);
  });

  it('declineReservation cancela la reserva y libera la mesa', async () => {
    const reservation = buildReservation();
    const { service, reservationRepo, tableRepo } =
      await makeService(reservation);

    const result = await service.applyConfirmationDecision('res-1', 'DECLINE');

    expect(result.tableId).toBe('table-1');
    const saved = reservationRepo.save.mock.calls[0][0];
    expect(saved.status).toBe(ReservationStatus.CANCELLED);
    expect(saved.confirmationStatus).toBe(
      ReservationConfirmationStatus.DECLINED,
    );
    const savedTable = tableRepo.save.mock.calls.at(-1)?.[0] as RestaurantTable;
    expect(savedTable.status).toBe(TableStatus.AVAILABLE);
  });
});
