import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReservationsService } from './reservations.service';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { ReservationWeeklySchedule } from './entities/reservation-weekly-schedule.entity';
import {
  RestaurantTable,
  TableStatus,
} from '../layouts/entities/restaurant-table.entity';
import { Order } from '../orders/entities/order.entity';

type AnyRepo = Record<string, jest.Mock>;

const validReservedFor = (): Date => {
  const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  d.setHours(12, 0, 0, 0);
  return d;
};

describe('ReservationsService (full)', () => {
  let service: ReservationsService;
  let reservationRepo: AnyRepo;
  let scheduleRepo: AnyRepo;
  let tableRepo: AnyRepo;
  let orderRepo: AnyRepo;
  let qb: AnyRepo;

  const buildTable = (overrides: Partial<RestaurantTable> = {}) => ({
    id: 'table-1',
    capacity: 4,
    status: TableStatus.AVAILABLE,
    ...overrides,
  });

  beforeEach(async () => {
    qb = {
      leftJoinAndSelect: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      addOrderBy: jest.fn(() => qb),
      getMany: jest.fn().mockResolvedValue([]),
    };
    reservationRepo = {
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ id: 'res-1', ...v })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(() => qb),
    };
    scheduleRepo = {
      count: jest.fn().mockResolvedValue(7),
      find: jest.fn().mockResolvedValue([]),
      findOneBy: jest.fn().mockResolvedValue({
        dayOfWeek: 1,
        isOpen: true,
        opensAt: '10:00',
        closesAt: '23:30',
      }),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(v)),
    };
    tableRepo = {
      findOneBy: jest.fn().mockResolvedValue(buildTable()),
      save: jest.fn((v) => Promise.resolve(v)),
    };
    orderRepo = { count: jest.fn().mockResolvedValue(0) };

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

    service = moduleRef.get(ReservationsService);
  });

  describe('create', () => {
    it('crea reserva valida', async () => {
      reservationRepo.findOne.mockResolvedValue({ id: 'res-1' });
      const result = await service.create({
        tableId: 'table-1',
        reservedFor: validReservedFor(),
        peopleCount: 2,
        holderName: ' Ana ',
        email: ' ANA@X.com ',
        phone: '+56 9 1234 5678',
        guestNames: [' Bob ', ''],
        notes: ' nota ',
      } as never);
      expect(reservationRepo.save).toHaveBeenCalled();
      expect(result.id).toBe('res-1');
    });

    it('rechaza mesa inexistente', async () => {
      tableRepo.findOneBy.mockResolvedValue(null);
      await expect(
        service.create({
          tableId: 'x',
          reservedFor: validReservedFor(),
          peopleCount: 2,
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza mesa fuera de servicio', async () => {
      tableRepo.findOneBy.mockResolvedValue(
        buildTable({ status: TableStatus.OUT_OF_SERVICE }),
      );
      await expect(
        service.create({
          tableId: 'table-1',
          reservedFor: validReservedFor(),
          peopleCount: 2,
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza exceso de capacidad', async () => {
      await expect(
        service.create({
          tableId: 'table-1',
          reservedFor: validReservedFor(),
          peopleCount: 10,
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza horario antes de las 10:00', async () => {
      const d = validReservedFor();
      d.setHours(8, 0, 0, 0);
      await expect(
        service.create({
          tableId: 'table-1',
          reservedFor: d,
          peopleCount: 2,
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza dia cerrado', async () => {
      scheduleRepo.findOneBy.mockResolvedValue({
        dayOfWeek: 1,
        isOpen: false,
        opensAt: null,
        closesAt: null,
      });
      await expect(
        service.create({
          tableId: 'table-1',
          reservedFor: validReservedFor(),
          peopleCount: 2,
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza sin configuracion de horario', async () => {
      scheduleRepo.findOneBy.mockResolvedValue(null);
      await expect(
        service.create({
          tableId: 'table-1',
          reservedFor: validReservedFor(),
          peopleCount: 2,
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza con poca anticipacion', async () => {
      await expect(
        service.create({
          tableId: 'table-1',
          reservedFor: new Date(Date.now() + 60 * 60 * 1000),
          peopleCount: 2,
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza con demasiada anticipacion', async () => {
      await expect(
        service.create({
          tableId: 'table-1',
          reservedFor: new Date(Date.now() + 220 * 24 * 60 * 60 * 1000),
          peopleCount: 2,
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza intervalo no permitido', async () => {
      const d = validReservedFor();
      d.setHours(12, 15, 0, 0);
      await expect(
        service.create({
          tableId: 'table-1',
          reservedFor: d,
          peopleCount: 2,
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('aplica filtros', async () => {
      qb.getMany.mockResolvedValue([{ id: 'res-1' }]);
      const result = await service.findAll({
        tableId: 'table-1',
        status: ReservationStatus.ACTIVE,
        email: 'a@x.com',
        phone: '+56912345678',
        startDate: new Date(),
        endDate: new Date(),
      } as never);
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('lanza NotFound', async () => {
      reservationRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    const existing = () => ({
      id: 'res-1',
      tableId: 'table-1',
      peopleCount: 2,
      reservedFor: validReservedFor(),
    });

    it('actualiza campos y cambia de mesa', async () => {
      reservationRepo.findOne
        .mockResolvedValueOnce(existing())
        .mockResolvedValueOnce({ id: 'res-1', tableId: 'table-2' });
      tableRepo.findOneBy.mockResolvedValue(buildTable({ id: 'table-2' }));
      const result = await service.update('res-1', {
        tableId: 'table-2',
        peopleCount: 3,
        reservedFor: validReservedFor(),
        holderName: 'Ana',
        email: 'a@x.com',
        phone: '123456789',
        guestNames: ['Bob'],
        notes: 'n',
        status: ReservationStatus.ACTIVE,
      } as never);
      expect(result).toBeDefined();
      // se sincronizan ambas mesas (previa y nueva)
      expect(tableRepo.save).toHaveBeenCalled();
    });

    it('respeta waitingUntil explicito', async () => {
      reservationRepo.findOne
        .mockResolvedValueOnce(existing())
        .mockResolvedValueOnce({ id: 'res-1', tableId: 'table-1' });
      const wu = new Date();
      await service.update('res-1', {
        reservedFor: validReservedFor(),
        waitingUntil: wu,
      } as never);
      const saved = reservationRepo.save.mock.calls[0][0];
      expect(saved.waitingUntil).toBe(wu);
    });
  });

  describe('remove', () => {
    it('elimina reserva', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 'res-1',
        tableId: 'table-1',
      });
      const result = await service.remove('res-1');
      expect(result.message).toContain('eliminada');
    });
  });

  describe('weekly schedule', () => {
    it('crea horario por defecto cuando no existe', async () => {
      scheduleRepo.count.mockResolvedValue(0);
      scheduleRepo.find.mockResolvedValue([]);
      await service.getWeeklySchedule();
      expect(scheduleRepo.save).toHaveBeenCalled();
    });

    it('actualiza dia abierto', async () => {
      const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        isOpen: true,
        opensAt: '10:00',
        closesAt: '23:30',
      }));
      scheduleRepo.find.mockResolvedValue(days);
      const result = await service.updateWeeklySchedule({
        days: [
          { dayOfWeek: 1, isOpen: true, opensAt: '11:00', closesAt: '22:00' },
        ],
      } as never);
      expect(result).toBeDefined();
      expect(scheduleRepo.save).toHaveBeenCalled();
    });

    it('cierra un dia', async () => {
      scheduleRepo.find.mockResolvedValue([{ dayOfWeek: 1 }]);
      await service.updateWeeklySchedule({
        days: [{ dayOfWeek: 1, isOpen: false }],
      } as never);
      expect(scheduleRepo.save).toHaveBeenCalled();
    });

    it('rechaza dia inexistente', async () => {
      scheduleRepo.find.mockResolvedValue([{ dayOfWeek: 1 }]);
      await expect(
        service.updateWeeklySchedule({
          days: [{ dayOfWeek: 5, isOpen: false }],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([
      ['sin horas', { dayOfWeek: 1, isOpen: true }],
      [
        'formato invalido',
        { dayOfWeek: 1, isOpen: true, opensAt: '9', closesAt: '99:99' },
      ],
      [
        'antes de las 10',
        { dayOfWeek: 1, isOpen: true, opensAt: '09:00', closesAt: '12:00' },
      ],
      [
        'apertura >= cierre',
        { dayOfWeek: 1, isOpen: true, opensAt: '12:00', closesAt: '11:00' },
      ],
      [
        'intervalo invalido',
        { dayOfWeek: 1, isOpen: true, opensAt: '10:00', closesAt: '10:20' },
      ],
    ])('rechaza %s', async (_l, day) => {
      scheduleRepo.find.mockResolvedValue([{ dayOfWeek: 1 }]);
      await expect(
        service.updateWeeklySchedule({ days: [day] } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cancelNoShowReservationsWithoutOrders (cron)', () => {
    it('no hace nada sin candidatas', async () => {
      reservationRepo.find.mockResolvedValue([]);
      await service.cancelNoShowReservationsWithoutOrders();
      expect(reservationRepo.update).not.toHaveBeenCalled();
    });

    it('no cancela si tienen orden asociada', async () => {
      reservationRepo.find.mockResolvedValue([{ id: 'r1', tableId: 't1' }]);
      orderRepo.find = jest.fn().mockResolvedValue([{ reservationId: 'r1' }]);
      await service.cancelNoShowReservationsWithoutOrders();
      expect(reservationRepo.update).not.toHaveBeenCalled();
    });

    it('cancela reservas no-show sin orden', async () => {
      reservationRepo.find.mockResolvedValue([
        { id: 'r1', tableId: 't1' },
        { id: 'r2', tableId: 't2' },
      ]);
      orderRepo.find = jest.fn().mockResolvedValue([]);
      await service.cancelNoShowReservationsWithoutOrders();
      expect(reservationRepo.update).toHaveBeenCalled();
    });
  });

  describe('recomputeTableStatus / sync', () => {
    it('marca mesa ocupada con ordenes activas', async () => {
      orderRepo.count.mockResolvedValue(1);
      await service.recomputeTableStatus('table-1');
      const saved = tableRepo.save.mock.calls.at(-1)?.[0];
      expect(saved.status).toBe(TableStatus.OCCUPIED);
    });

    it('marca mesa reservada con reservas activas', async () => {
      orderRepo.count.mockResolvedValue(0);
      reservationRepo.count.mockResolvedValue(1);
      await service.recomputeTableStatus('table-1');
      const saved = tableRepo.save.mock.calls.at(-1)?.[0];
      expect(saved.status).toBe(TableStatus.RESERVED);
    });

    it('marca mesa disponible sin actividad', async () => {
      orderRepo.count.mockResolvedValue(0);
      reservationRepo.count.mockResolvedValue(0);
      await service.recomputeTableStatus('table-1');
      const saved = tableRepo.save.mock.calls.at(-1)?.[0];
      expect(saved.status).toBe(TableStatus.AVAILABLE);
    });

    it('ignora mesa inexistente', async () => {
      tableRepo.findOneBy.mockResolvedValue(null);
      await service.recomputeTableStatus('x');
      expect(tableRepo.save).not.toHaveBeenCalled();
    });

    it('ignora mesa fuera de servicio', async () => {
      tableRepo.findOneBy.mockResolvedValue(
        buildTable({ status: TableStatus.OUT_OF_SERVICE }),
      );
      await service.recomputeTableStatus('table-1');
      expect(tableRepo.save).not.toHaveBeenCalled();
    });
  });
});
