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

describe('ReservationsService create/update', () => {
  const slot = (dayOffset: number, hours: number, minutes = 0): Date => {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const nextSunday = (): Date => {
    const date = new Date();
    date.setDate(date.getDate() + ((7 - date.getDay()) % 7 || 7));
    date.setHours(12, 0, 0, 0);
    return date;
  };

  const makeService = async (existing?: Partial<Reservation>) => {
    const saved: Reservation[] = [];
    const reservationRepo = {
      create: jest.fn((data: Partial<Reservation>) => ({ ...data })),
      save: jest.fn((reservation: Reservation) => {
        saved.push(reservation);
        return Promise.resolve({
          ...reservation,
          id: reservation.id ?? 'res-1',
        });
      }),
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'res-1', tableId: 'table-1', ...existing }),
      count: jest.fn().mockResolvedValue(0),
    };
    const scheduleRepo = {
      count: jest.fn().mockResolvedValue(7),
      findOneBy: jest.fn().mockResolvedValue({
        dayOfWeek: 0,
        isOpen: true,
        opensAt: '10:00',
        closesAt: '23:30',
      }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const tableRepo = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'table-1',
        capacity: 6,
        status: TableStatus.AVAILABLE,
      }),
      save: jest.fn((table: RestaurantTable) => Promise.resolve(table)),
    };
    const orderRepo = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn(),
    };

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
      scheduleRepo,
      saved,
    };
  };

  it('normaliza campos vacios a null y limpia los nombres de invitados', async () => {
    const { service, reservationRepo } = await makeService();

    await service.create({
      tableId: 'table-1',
      reservedFor: slot(3, 12),
      peopleCount: 2,
      holderName: '   ',
      email: '  ',
      phone: '   ',
      notes: '  ',
      guestNames: [' Ana ', '   ', 'Beto'],
    } as never);

    const created = reservationRepo.create.mock.calls[0][0] as Reservation;
    expect(created.holderName).toBeNull();
    expect(created.email).toBeNull();
    expect(created.phone).toBeNull();
    expect(created.notes).toBeNull();
    expect(created.guestNames).toEqual(['Ana', 'Beto']);
  });

  it('normaliza email en minusculas y telefono a digitos', async () => {
    const { service, reservationRepo } = await makeService();

    await service.create({
      tableId: 'table-1',
      reservedFor: slot(3, 12, 30),
      peopleCount: 2,
      email: '  ANA@Mail.CL ',
      phone: '+56 9 1234 5678',
    } as never);

    const created = reservationRepo.create.mock.calls[0][0] as Reservation;
    expect(created.email).toBe('ana@mail.cl');
    expect(created.phone).toBe('+56912345678');
  });

  it('quita el signo + intermedio en telefonos sin prefijo', async () => {
    const { service, reservationRepo } = await makeService();

    await service.create({
      tableId: 'table-1',
      reservedFor: slot(3, 12),
      peopleCount: 2,
      phone: '56 9 1234+5678',
    } as never);

    const created = reservationRepo.create.mock.calls[0][0] as Reservation;
    expect(created.phone).toBe('56912345678');
  });

  it('el domingo se mapea al dia 6 del horario semanal', async () => {
    const { service, scheduleRepo } = await makeService();

    await service.create({
      tableId: 'table-1',
      reservedFor: nextSunday(),
      peopleCount: 2,
    } as never);

    expect(scheduleRepo.findOneBy).toHaveBeenCalledWith({ dayOfWeek: 6 });
  });

  it('rechaza reservas despues del cierre', async () => {
    const { service } = await makeService();

    await expect(
      service.create({
        tableId: 'table-1',
        reservedFor: slot(3, 23, 45),
        peopleCount: 2,
      } as never),
    ).rejects.toThrow('La hora seleccionada no esta disponible para reservas');
  });

  it('update limpia holderName, email y notes vacios', async () => {
    const { service, saved } = await makeService({
      status: ReservationStatus.ACTIVE,
      holderName: 'Ana',
      email: 'ana@mail.cl',
      notes: 'algo',
    });

    await service.update('res-1', {
      holderName: '  ',
      email: '  ',
      notes: '  ',
      guestNames: [' Ana ', ' '],
    } as never);

    const updated = saved.at(-1) as Reservation;
    expect(updated.holderName).toBeNull();
    expect(updated.email).toBeNull();
    expect(updated.notes).toBeNull();
    expect(updated.guestNames).toEqual(['Ana']);
  });
});
