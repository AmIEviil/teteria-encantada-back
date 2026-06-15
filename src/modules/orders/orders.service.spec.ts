import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { MonthlyTableSalesSummary } from './entities/monthly-table-sales-summary.entity';
import { Product } from '../products/entities/product.entity';
import {
  RestaurantTable,
  TableStatus,
} from '../layouts/entities/restaurant-table.entity';
import {
  Reservation,
  ReservationStatus,
} from '../reservations/entities/reservation.entity';
import {
  OrderReportOrderDirection,
  OrderReportSortBy,
} from './dto/get-orders-report.dto';

type AnyRepo = Record<string, jest.Mock> & { manager?: unknown };

const makeQb = () => {
  const qb: Record<string, jest.Mock> = {};
  [
    'leftJoin',
    'andWhere',
    'where',
    'orderBy',
    'addOrderBy',
    'select',
    'addSelect',
    'offset',
    'limit',
    'setParameters',
    'setLock',
    'groupBy',
  ].forEach((m) => (qb[m] = jest.fn(() => qb)));
  qb.clone = jest.fn(() => qb);
  qb.getCount = jest.fn();
  qb.getRawMany = jest.fn();
  qb.getRawOne = jest.fn();
  qb.getMany = jest.fn();
  return qb;
};

const buildProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 'prod-1',
    name: 'Cafe',
    price: 10,
    currentQuantity: 100,
    ...overrides,
  }) as Product;

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepo: AnyRepo;
  let orderItemRepo: AnyRepo;
  let productRepo: AnyRepo;
  let tableRepo: AnyRepo;
  let reservationRepo: AnyRepo;
  let summaryRepo: AnyRepo;

  // transactional repos
  let txOrder: AnyRepo;
  let txOrderItem: AnyRepo;
  let txProduct: AnyRepo;
  let txTable: AnyRepo;
  let txReservation: AnyRepo;
  let txSummary: AnyRepo;
  let productQb: ReturnType<typeof makeQb>;
  let orderQb: ReturnType<typeof makeQb>;

  beforeEach(async () => {
    productQb = makeQb();
    orderQb = makeQb();

    txOrder = {
      create: jest.fn((v) => ({ id: 'order-1', createdAt: new Date(), ...v })),
      save: jest.fn((v) =>
        Promise.resolve({ id: 'order-1', createdAt: new Date(), ...v }),
      ),
      findOneBy: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
      remove: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(() => orderQb),
    };
    txOrderItem = {
      create: jest.fn((v) => v),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    txProduct = {
      find: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => productQb),
    };
    txTable = {
      findOneBy: jest.fn(),
      save: jest.fn((v) => Promise.resolve(v)),
    };
    txReservation = {
      findOneBy: jest.fn(),
      save: jest.fn((v) => Promise.resolve(v)),
      count: jest.fn().mockResolvedValue(0),
    };
    txSummary = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(v)),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const entityManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Order) return txOrder;
        if (entity === OrderItem) return txOrderItem;
        if (entity === Product) return txProduct;
        if (entity === RestaurantTable) return txTable;
        if (entity === Reservation) return txReservation;
        if (entity === MonthlyTableSalesSummary) return txSummary;
        return {};
      }),
    };

    orderRepo = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn(() => orderQb),
    };
    orderRepo.manager = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(entityManager)),
    };
    orderItemRepo = {};
    productRepo = {};
    tableRepo = { findOneBy: jest.fn() };
    reservationRepo = { findOneBy: jest.fn(), count: jest.fn() };
    summaryRepo = { findOne: jest.fn(), save: jest.fn(), delete: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(RestaurantTable), useValue: tableRepo },
        { provide: getRepositoryToken(Reservation), useValue: reservationRepo },
        {
          provide: getRepositoryToken(MonthlyTableSalesSummary),
          useValue: summaryRepo,
        },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  describe('create', () => {
    it('rechaza orden sin items', async () => {
      await expect(
        service.create({ items: [] } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('crea orden sin mesa ni reserva', async () => {
      productQb.getMany.mockResolvedValue([buildProduct()]);
      const result = await service.create({
        items: [{ productId: 'prod-1', quantity: 2 }],
      } as never);
      expect(result.id).toBe('order-1');
      expect(txOrder.create).toHaveBeenCalled();
    });

    it('crea orden con mesa y actualiza summary', async () => {
      txTable.findOneBy.mockResolvedValue({
        id: 'table-1',
        status: TableStatus.AVAILABLE,
        capacity: 4,
      });
      productQb.getMany.mockResolvedValue([buildProduct()]);
      orderQb.getRawOne
        .mockResolvedValueOnce({
          totalOrders: '2',
          totalSales: '40',
          lastOrderAt: new Date(),
        })
        .mockResolvedValueOnce({ totalItems: '5' });
      const result = await service.create({
        tableId: 'table-1',
        items: [{ productId: 'prod-1', quantity: 2 }],
      } as never);
      expect(txTable.save).toHaveBeenCalled();
      expect(txSummary.save).toHaveBeenCalled();
      expect(result.tableId).toBe('table-1');
    });

    it('borra summary cuando no hay ordenes pagadas', async () => {
      txTable.findOneBy.mockResolvedValue({
        id: 'table-1',
        status: TableStatus.AVAILABLE,
        capacity: 4,
      });
      productQb.getMany.mockResolvedValue([buildProduct()]);
      orderQb.getRawOne.mockResolvedValueOnce({
        totalOrders: '0',
        totalSales: '0',
        lastOrderAt: null,
      });
      await service.create({
        tableId: 'table-1',
        items: [{ productId: 'prod-1', quantity: 1 }],
      } as never);
      expect(txSummary.delete).toHaveBeenCalled();
    });

    it('fusiona con orden activa existente', async () => {
      txTable.findOneBy.mockResolvedValue({
        id: 'table-1',
        status: TableStatus.OCCUPIED,
        capacity: 4,
      });
      productQb.getMany.mockResolvedValue([buildProduct()]);
      txOrder.findOne.mockResolvedValue({
        id: 'order-act',
        items: [{ subtotal: 10 }],
        notes: 'old',
        status: OrderStatus.OPEN,
        tableId: 'table-1',
      });
      orderQb.getRawOne.mockResolvedValue({ totalOrders: '0' });
      const result = await service.create({
        tableId: 'table-1',
        notes: 'mas',
        peopleCount: 3,
        items: [{ productId: 'prod-1', quantity: 1 }],
      } as never);
      expect(result.id).toBe('order-act');
      expect(result.notes).toContain('mas');
    });

    it('valida reserva contra mesa elegida', async () => {
      txReservation.findOneBy.mockResolvedValue({
        id: 'res-1',
        tableId: 'table-2',
        status: ReservationStatus.ACTIVE,
        reservedFor: new Date(Date.now() + 3600000),
        waitingUntil: null,
      });
      await expect(
        service.create({
          tableId: 'table-1',
          reservationId: 'res-1',
          items: [{ productId: 'prod-1', quantity: 1 }],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('usa la mesa de la reserva', async () => {
      txReservation.findOneBy.mockResolvedValue({
        id: 'res-1',
        tableId: 'table-1',
        status: ReservationStatus.ACTIVE,
        reservedFor: new Date(Date.now() + 3600000),
        waitingUntil: new Date(Date.now() + 3600000),
      });
      txTable.findOneBy.mockResolvedValue({
        id: 'table-1',
        status: TableStatus.RESERVED,
        capacity: 2,
      });
      productQb.getMany.mockResolvedValue([buildProduct()]);
      orderQb.getRawOne.mockResolvedValue({ totalOrders: '0' });
      const result = await service.create({
        reservationId: 'res-1',
        items: [{ productId: 'prod-1', quantity: 1 }],
      } as never);
      expect(txReservation.save).toHaveBeenCalled();
      expect(result.reservationId).toBe('res-1');
    });

    it('rechaza reserva no encontrada', async () => {
      txReservation.findOneBy.mockResolvedValue(null);
      await expect(
        service.create({
          reservationId: 'res-x',
          items: [{ productId: 'prod-1', quantity: 1 }],
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza reserva no activa', async () => {
      txReservation.findOneBy.mockResolvedValue({
        id: 'res-1',
        tableId: 'table-1',
        status: ReservationStatus.CANCELLED,
        reservedFor: new Date(Date.now() + 3600000),
      });
      await expect(
        service.create({
          reservationId: 'res-1',
          items: [{ productId: 'prod-1', quantity: 1 }],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza reserva vencida', async () => {
      txReservation.findOneBy.mockResolvedValue({
        id: 'res-1',
        tableId: 'table-1',
        status: ReservationStatus.ACTIVE,
        reservedFor: new Date(Date.now() - 7200000),
        waitingUntil: null,
      });
      await expect(
        service.create({
          reservationId: 'res-1',
          items: [{ productId: 'prod-1', quantity: 1 }],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza mesa fuera de servicio', async () => {
      txTable.findOneBy.mockResolvedValue({
        id: 'table-1',
        status: TableStatus.OUT_OF_SERVICE,
      });
      await expect(
        service.create({
          tableId: 'table-1',
          items: [{ productId: 'prod-1', quantity: 1 }],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza mesa inexistente', async () => {
      txTable.findOneBy.mockResolvedValue(null);
      await expect(
        service.create({
          tableId: 'table-1',
          items: [{ productId: 'prod-1', quantity: 1 }],
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza productos faltantes', async () => {
      productQb.getMany.mockResolvedValue([]);
      await expect(
        service.create({
          items: [{ productId: 'prod-1', quantity: 1 }],
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza stock insuficiente', async () => {
      productQb.getMany.mockResolvedValue([
        buildProduct({ currentQuantity: 1 }),
      ]);
      await expect(
        service.create({
          items: [{ productId: 'prod-1', quantity: 5 }],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('consulta con filtros', async () => {
      orderRepo.find.mockResolvedValue([{ id: 'o1' }]);
      const result = await service.findAll('table-1', OrderStatus.OPEN);
      expect(result).toHaveLength(1);
      expect(orderRepo.find).toHaveBeenCalled();
    });

    it('consulta sin filtros', async () => {
      orderRepo.find.mockResolvedValue([]);
      await service.findAll();
      expect(orderRepo.find).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('devuelve orden', async () => {
      orderRepo.findOneBy.mockResolvedValue({ id: 'o1' });
      expect(await service.findOne('o1')).toEqual({ id: 'o1' });
    });
    it('lanza NotFound', async () => {
      orderRepo.findOneBy.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('lanza NotFound', async () => {
      txOrder.findOneBy.mockResolvedValue(null);
      await expect(service.update('x', {} as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rechaza lista de items vacia', async () => {
      txOrder.findOneBy.mockResolvedValue({ id: 'o1', tableId: null });
      await expect(
        service.update('o1', { items: [] } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('actualiza items, notas y estado PAID', async () => {
      txOrder.findOneBy.mockResolvedValue({
        id: 'o1',
        tableId: null,
        closedAt: null,
      });
      productQb.getMany.mockResolvedValue([buildProduct()]);
      const result = await service.update('o1', {
        items: [{ productId: 'prod-1', quantity: 2 }],
        notes: 'n',
        peopleCount: 4,
        status: OrderStatus.PAID,
      } as never);
      expect(result.status).toBe(OrderStatus.PAID);
      expect(result.closedAt).toBeInstanceOf(Date);
    });

    it('estado abierto limpia closedAt y sincroniza mesa', async () => {
      txOrder.findOneBy.mockResolvedValue({
        id: 'o1',
        tableId: 'table-1',
        closedAt: new Date(),
      });
      txTable.findOneBy.mockResolvedValue({
        id: 'table-1',
        status: TableStatus.OCCUPIED,
      });
      txOrder.count.mockResolvedValue(1);
      const result = await service.update('o1', {
        status: OrderStatus.IN_PROGRESS,
      } as never);
      expect(result.closedAt).toBeNull();
      expect(txTable.save).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('lanza NotFound', async () => {
      txOrder.findOneBy.mockResolvedValue(null);
      await expect(service.remove('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('elimina orden y sincroniza mesa a disponible', async () => {
      txOrder.findOneBy.mockResolvedValue({
        id: 'o1',
        tableId: 'table-1',
        createdAt: new Date(),
      });
      txTable.findOneBy.mockResolvedValue({
        id: 'table-1',
        status: TableStatus.OCCUPIED,
      });
      txOrder.count.mockResolvedValue(0);
      reservationRepo.count.mockResolvedValue(0);
      const result = await service.remove('o1');
      expect(result.message).toContain('eliminada');
      const savedTable = txTable.save.mock.calls.at(-1)?.[0];
      expect(savedTable.status).toBe(TableStatus.AVAILABLE);
    });

    it('sincroniza mesa a reservada si hay reservas activas', async () => {
      txOrder.findOneBy.mockResolvedValue({
        id: 'o1',
        tableId: 'table-1',
        createdAt: new Date(),
      });
      txTable.findOneBy.mockResolvedValue({
        id: 'table-1',
        status: TableStatus.OCCUPIED,
      });
      txOrder.count.mockResolvedValue(0);
      reservationRepo.count.mockResolvedValue(1);
      await service.remove('o1');
      const savedTable = txTable.save.mock.calls.at(-1)?.[0];
      expect(savedTable.status).toBe(TableStatus.RESERVED);
    });
  });

  describe('findReport', () => {
    const setupReport = () => {
      orderQb.getCount.mockResolvedValue(1);
      orderQb.getRawMany
        .mockResolvedValueOnce([{ id: 'o1' }]) // order ids
        .mockResolvedValueOnce([
          {
            month: '2026-06',
            totalOrders: '1',
            paidOrders: '1',
            cancelledOrders: '0',
            totalSales: '10',
            paidSales: '10',
          },
        ]);
      orderQb.getRawOne.mockResolvedValue({
        totalOrders: '1',
        paidOrders: '1',
        cancelledOrders: '0',
        totalSales: '10',
        paidSales: '10',
      });
      orderRepo.find.mockResolvedValue([{ id: 'o1' }]);
    };

    it('devuelve reporte paginado con filtros y busqueda', async () => {
      setupReport();
      const result = await service.findReport({
        tableId: 'table-1',
        status: OrderStatus.PAID,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        search: '  cafe  ',
        page: 1,
        limit: 10,
        orderBy: OrderReportSortBy.TOTAL,
        orderDirection: OrderReportOrderDirection.ASC,
      });
      expect(result.items).toHaveLength(1);
      expect(result.totals.totalOrders).toBe(1);
      expect(result.monthlySummary).toHaveLength(1);
    });

    it('maneja reporte vacio y defaults', async () => {
      orderQb.getCount.mockResolvedValue(0);
      orderQb.getRawMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      orderQb.getRawOne.mockResolvedValue(undefined);
      const result = await service.findReport({});
      expect(result.items).toHaveLength(0);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('rechaza rango de fechas invalido', async () => {
      await expect(
        service.findReport({
          startDate: '2026-06-30',
          endDate: '2026-06-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([
      OrderReportSortBy.UPDATED_AT,
      OrderReportSortBy.STATUS,
      OrderReportSortBy.PEOPLE_COUNT,
      OrderReportSortBy.TABLE,
      OrderReportSortBy.CREATED_AT,
    ])('ordena por %s', async (orderBy) => {
      setupReport();
      const result = await service.findReport({ orderBy });
      expect(result).toBeDefined();
    });
  });
});
