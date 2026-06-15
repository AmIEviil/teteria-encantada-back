import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PublicService } from './public.service';
import { Product } from '../products/entities/product.entity';
import { RestaurantTable } from '../layouts/entities/restaurant-table.entity';
import { ReservationsService } from '../reservations/reservations.service';

describe('PublicService', () => {
  let service: PublicService;
  let productRepo: Record<string, jest.Mock>;
  let tableRepo: Record<string, jest.Mock>;
  let reservationsService: Record<string, jest.Mock>;

  beforeEach(async () => {
    productRepo = { find: jest.fn().mockResolvedValue([]) };
    tableRepo = { find: jest.fn().mockResolvedValue([]) };
    reservationsService = {
      findAll: jest.fn().mockResolvedValue([]),
      getWeeklySchedule: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PublicService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(RestaurantTable), useValue: tableRepo },
        { provide: ReservationsService, useValue: reservationsService },
      ],
    }).compile();
    service = moduleRef.get(PublicService);
  });

  it('findMenu mapea productos activos', async () => {
    productRepo.find.mockResolvedValue([
      { id: 'p1', code: 'C', name: 'N', description: null, price: 10 },
    ]);
    const result = await service.findMenu();
    expect(result[0].id).toBe('p1');
  });

  it('findTables mapea mesas', async () => {
    tableRepo.find.mockResolvedValue([
      { id: 't1', code: 'M1', label: null, capacity: 4, status: 'AVAILABLE' },
    ]);
    const result = await service.findTables();
    expect(result[0].code).toBe('M1');
  });

  it('findReservations exige email o telefono', async () => {
    await expect(service.findReservations({} as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('findReservations mapea resultados', async () => {
    reservationsService.findAll.mockResolvedValue([
      {
        id: 'r1',
        tableId: 't1',
        table: { code: 'M1', label: 'Mesa' },
        reservedFor: new Date(),
        peopleCount: 2,
        holderName: 'Ana',
        email: 'a@x.com',
        phone: null,
        guestNames: [],
        notes: null,
        waitingUntil: null,
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ]);
    const result = await service.findReservations({ email: 'a@x.com' } as never);
    expect(result[0].tableCode).toBe('M1');
  });

  it('findReservations sin tabla usa defaults', async () => {
    reservationsService.findAll.mockResolvedValue([
      {
        id: 'r1',
        tableId: 't1',
        table: null,
        reservedFor: new Date(),
        peopleCount: 2,
        holderName: null,
        email: null,
        phone: '123',
        guestNames: [],
        notes: null,
        waitingUntil: undefined,
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ]);
    const result = await service.findReservations({ phone: '123' } as never);
    expect(result[0].tableCode).toBe('');
    expect(result[0].waitingUntil).toBeNull();
  });

  it('findReservationSchedule mapea horarios', async () => {
    reservationsService.getWeeklySchedule.mockResolvedValue([
      { dayOfWeek: 1, isOpen: true, opensAt: '10:00', closesAt: '23:00' },
    ]);
    const result = await service.findReservationSchedule();
    expect(result[0].dayOfWeek).toBe(1);
  });

  it('createReservation delega y mapea', async () => {
    reservationsService.create.mockResolvedValue({
      id: 'r1',
      tableId: 't1',
      table: { code: 'M1', label: null },
      reservedFor: new Date(),
      peopleCount: 2,
      guestNames: [],
      status: 'ACTIVE',
      createdAt: new Date(),
    });
    const result = await service.createReservation({
      tableId: 't1',
    } as never);
    expect(result.id).toBe('r1');
  });
});
