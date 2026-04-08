import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  IsNull,
  MoreThanOrEqual,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import {
  RestaurantTable,
  TableStatus,
} from '../layouts/entities/restaurant-table.entity';
import { Product } from '../products/entities/product.entity';
import {
  Reservation,
  ReservationStatus,
} from '../reservations/entities/reservation.entity';
import { CreateOrderDto, CreateOrderItemDto } from './dto/create-order.dto';
import {
  GetOrdersReportDto,
  OrderReportOrderDirection,
  OrderReportSortBy,
} from './dto/get-orders-report.dto';
import {
  OrdersMonthlySummaryItem,
  OrdersReportResponse,
  OrdersReportTotals,
} from './dto/orders-report-response.dto';
import { UpdateOrderDto, UpdateOrderItemDto } from './dto/update-order.dto';
import { MonthlyTableSalesSummary } from './entities/monthly-table-sales-summary.entity';
import { OrderItem } from './entities/order-item.entity';
import { Order, OrderStatus } from './entities/order.entity';

interface NormalizedReportFilters {
  tableId?: string;
  status?: OrderStatus;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  page: number;
  limit: number;
  orderBy: OrderReportSortBy;
  orderDirection: OrderReportOrderDirection;
}

interface MonthlySummaryRaw {
  month: string;
  totalOrders: string;
  paidOrders: string;
  cancelledOrders: string;
  totalSales: string;
  paidSales: string;
}

interface TotalsRaw {
  totalOrders: string;
  paidOrders: string;
  cancelledOrders: string;
  totalSales: string;
  paidSales: string;
}

interface SummaryAggregationRaw {
  totalOrders: string;
  totalSales: string;
  lastOrderAt: Date | null;
}

interface SummaryItemsRaw {
  totalItems: string;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(RestaurantTable)
    private readonly tableRepository: Repository<RestaurantTable>,
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    @InjectRepository(MonthlyTableSalesSummary)
    private readonly monthlySummaryRepository: Repository<MonthlyTableSalesSummary>,
  ) {}

  private static readonly ACTIVE_ORDER_STATUSES: OrderStatus[] = [
    OrderStatus.OPEN,
    OrderStatus.IN_PROGRESS,
    OrderStatus.SERVED,
  ];

  private static readonly DEFAULT_REPORT_PAGE = 1;

  private static readonly DEFAULT_REPORT_LIMIT = 10;

  private static readonly DEFAULT_RESERVATION_WAIT_MINUTES = 15;

  async create(createOrderDto: CreateOrderDto): Promise<Order> {
    if (createOrderDto.items.length === 0) {
      throw new BadRequestException('La orden debe tener al menos un item');
    }

    return this.orderRepository.manager.transaction(async (entityManager) => {
      const transactionalTableRepository =
        entityManager.getRepository(RestaurantTable);
      const transactionalProductRepository =
        entityManager.getRepository(Product);
      const transactionalOrderRepository = entityManager.getRepository(Order);
      const transactionalOrderItemRepository =
        entityManager.getRepository(OrderItem);
      const transactionalReservationRepository =
        entityManager.getRepository(Reservation);
      const transactionalMonthlySummaryRepository = entityManager.getRepository(
        MonthlyTableSalesSummary,
      );
      const { table, reservation, targetTableId } =
        await this.resolveOrderCreationContext(
          createOrderDto,
          transactionalTableRepository,
          transactionalReservationRepository,
        );

      const productMap = await this.getProductsMapForItems(
        createOrderDto.items,
        transactionalProductRepository,
        true,
      );

      this.discountInventory(createOrderDto.items, productMap);
      await transactionalProductRepository.save([...productMap.values()]);

      const newItems = this.buildOrderItemsFromMap(
        createOrderDto.items,
        productMap,
        transactionalOrderItemRepository,
      );

      const activeOrder = targetTableId
        ? await this.findActiveOrderByTableId(
            targetTableId,
            transactionalOrderRepository,
          )
        : null;

      if (activeOrder) {
        activeOrder.items = [...activeOrder.items, ...newItems];
        activeOrder.total = this.calculateTotal(activeOrder.items);
        activeOrder.notes = this.mergeOrderNotes(
          activeOrder.notes,
          createOrderDto.notes,
        );
        if (createOrderDto.peopleCount !== undefined) {
          activeOrder.peopleCount = createOrderDto.peopleCount;
        }

        if (reservation) {
          activeOrder.reservationId = reservation.id;
        }

        activeOrder.status = this.ensureActiveStatus(activeOrder.status);

        const updatedOrder =
          await transactionalOrderRepository.save(activeOrder);

        await this.settleOrderTableAndReservation(
          table,
          reservation,
          transactionalTableRepository,
          transactionalReservationRepository,
        );

        await this.refreshMonthlySummaryForOrder(
          updatedOrder,
          transactionalOrderRepository,
          transactionalMonthlySummaryRepository,
        );

        return updatedOrder;
      }

      const order = transactionalOrderRepository.create({
        tableId: targetTableId ?? null,
        reservationId: reservation?.id ?? null,
        notes: createOrderDto.notes ?? null,
        peopleCount: createOrderDto.peopleCount ?? table?.capacity ?? 1,
        status: OrderStatus.OPEN,
        items: newItems,
        total: this.calculateTotal(newItems),
        closedAt: null,
      });

      const savedOrder = await transactionalOrderRepository.save(order);

      await this.settleOrderTableAndReservation(
        table,
        reservation,
        transactionalTableRepository,
        transactionalReservationRepository,
      );

      await this.refreshMonthlySummaryForOrder(
        savedOrder,
        transactionalOrderRepository,
        transactionalMonthlySummaryRepository,
      );

      return savedOrder;
    });
  }

  private async resolveOrderCreationContext(
    createOrderDto: CreateOrderDto,
    tableRepository: Repository<RestaurantTable>,
    reservationRepository: Repository<Reservation>,
  ): Promise<{
    table: RestaurantTable | null;
    reservation: Reservation | null;
    targetTableId: string | undefined;
  }> {
    let reservation: Reservation | null = null;
    let targetTableId = createOrderDto.tableId;

    if (createOrderDto.reservationId) {
      reservation = await this.validateReservationForOrder(
        createOrderDto.reservationId,
        reservationRepository,
      );

      if (targetTableId && reservation.tableId !== targetTableId) {
        throw new BadRequestException(
          'La reserva seleccionada no pertenece a la mesa elegida',
        );
      }

      targetTableId = reservation.tableId;
    }

    if (!targetTableId) {
      return {
        table: null,
        reservation,
        targetTableId,
      };
    }

    const table = await this.validateTableExists(
      targetTableId,
      tableRepository,
    );

    if (table.status === TableStatus.OUT_OF_SERVICE) {
      throw new BadRequestException(
        'La mesa seleccionada no esta disponible para tomar ordenes',
      );
    }

    return {
      table,
      reservation,
      targetTableId,
    };
  }

  private async settleOrderTableAndReservation(
    table: RestaurantTable | null,
    reservation: Reservation | null,
    tableRepository: Repository<RestaurantTable>,
    reservationRepository: Repository<Reservation>,
  ): Promise<void> {
    if (table) {
      table.status = TableStatus.OCCUPIED;
      await tableRepository.save(table);
    }

    if (reservation) {
      reservation.status = ReservationStatus.COMPLETED;
      await reservationRepository.save(reservation);
    }
  }

  findAll(tableId?: string, status?: OrderStatus): Promise<Order[]> {
    return this.orderRepository.find({
      where: {
        ...(tableId ? { tableId } : {}),
        ...(status ? { status } : {}),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findReport(filters: GetOrdersReportDto): Promise<OrdersReportResponse> {
    const normalizedFilters = this.normalizeReportFilters(filters);

    const baseQuery = this.orderRepository
      .createQueryBuilder('ord')
      .leftJoin('ord.table', 'table');

    this.applyReportFilters(baseQuery, normalizedFilters);
    this.applyReportOrder(
      baseQuery,
      normalizedFilters.orderBy,
      normalizedFilters.orderDirection,
    );

    const totalItems = await baseQuery.clone().getCount();
    const totalPages = Math.max(
      1,
      Math.ceil(totalItems / normalizedFilters.limit),
    );
    const currentPage = Math.min(normalizedFilters.page, totalPages);
    const offset = (currentPage - 1) * normalizedFilters.limit;

    const orderIdRows = await baseQuery
      .clone()
      .select('ord.id', 'id')
      .offset(offset)
      .limit(normalizedFilters.limit)
      .getRawMany<{ id: string }>();

    const orderIds = orderIdRows.map((row) => row.id);

    const paginatedOrders =
      orderIds.length === 0
        ? []
        : await this.orderRepository.find({
            where: {
              id: In(orderIds),
            },
          });

    const ordersById = new Map(
      paginatedOrders.map((order) => [order.id, order]),
    );
    const orderedItems = orderIds
      .map((id) => ordersById.get(id))
      .filter((order): order is Order => Boolean(order));

    const [monthlySummary, totals] = await Promise.all([
      this.buildMonthlySummary(baseQuery),
      this.buildTotals(baseQuery),
    ]);

    return {
      items: orderedItems,
      pagination: {
        page: currentPage,
        limit: normalizedFilters.limit,
        totalItems,
        totalPages,
      },
      monthlySummary,
      totals,
    };
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.orderRepository.findOneBy({ id });

    if (!order) {
      throw new NotFoundException(`Orden con id ${id} no encontrada`);
    }

    return order;
  }

  async update(id: string, updateOrderDto: UpdateOrderDto): Promise<Order> {
    return this.orderRepository.manager.transaction(async (entityManager) => {
      const transactionalOrderRepository = entityManager.getRepository(Order);
      const transactionalOrderItemRepository =
        entityManager.getRepository(OrderItem);
      const transactionalProductRepository =
        entityManager.getRepository(Product);
      const transactionalTableRepository =
        entityManager.getRepository(RestaurantTable);
      const transactionalMonthlySummaryRepository = entityManager.getRepository(
        MonthlyTableSalesSummary,
      );

      const order = await transactionalOrderRepository.findOneBy({ id });

      if (!order) {
        throw new NotFoundException(`Orden con id ${id} no encontrada`);
      }

      if (updateOrderDto.items !== undefined) {
        if (updateOrderDto.items.length === 0) {
          throw new BadRequestException(
            'Una orden debe tener al menos un item cuando se actualiza la lista de items',
          );
        }

        await transactionalOrderItemRepository.delete({ orderId: order.id });

        const productMap = await this.getProductsMapForItems(
          updateOrderDto.items,
          transactionalProductRepository,
          true,
        );
        this.discountInventory(updateOrderDto.items, productMap);
        await transactionalProductRepository.save([...productMap.values()]);

        order.items = this.buildOrderItemsFromMap(
          updateOrderDto.items,
          productMap,
          transactionalOrderItemRepository,
        );
        order.total = this.calculateTotal(order.items);
      }

      if (updateOrderDto.notes !== undefined) {
        order.notes = updateOrderDto.notes;
      }

      if (updateOrderDto.peopleCount !== undefined) {
        order.peopleCount = updateOrderDto.peopleCount;
      }

      if (updateOrderDto.status !== undefined) {
        order.status = updateOrderDto.status;

        if (
          updateOrderDto.status === OrderStatus.PAID ||
          updateOrderDto.status === OrderStatus.CANCELLED
        ) {
          order.closedAt = order.closedAt ?? new Date();
        } else {
          order.closedAt = null;
        }
      }

      const savedOrder = await transactionalOrderRepository.save(order);

      if (order.tableId) {
        await this.syncTableStatusWithActiveOrders(
          order.tableId,
          transactionalTableRepository,
          transactionalOrderRepository,
        );
      }

      await this.refreshMonthlySummaryForOrder(
        savedOrder,
        transactionalOrderRepository,
        transactionalMonthlySummaryRepository,
      );

      return savedOrder;
    });
  }

  async remove(id: string): Promise<{ message: string }> {
    return this.orderRepository.manager.transaction(async (entityManager) => {
      const transactionalOrderRepository = entityManager.getRepository(Order);
      const transactionalTableRepository =
        entityManager.getRepository(RestaurantTable);
      const transactionalMonthlySummaryRepository = entityManager.getRepository(
        MonthlyTableSalesSummary,
      );

      const order = await transactionalOrderRepository.findOneBy({ id });

      if (!order) {
        throw new NotFoundException(`Orden con id ${id} no encontrada`);
      }

      const orderSummarySnapshot: Pick<Order, 'createdAt' | 'tableId'> = {
        createdAt: order.createdAt,
        tableId: order.tableId,
      };

      await transactionalOrderRepository.remove(order);

      if (order.tableId) {
        await this.syncTableStatusWithActiveOrders(
          order.tableId,
          transactionalTableRepository,
          transactionalOrderRepository,
        );
      }

      await this.refreshMonthlySummaryForOrder(
        orderSummarySnapshot,
        transactionalOrderRepository,
        transactionalMonthlySummaryRepository,
      );

      return { message: 'Orden eliminada correctamente' };
    });
  }

  private normalizeReportFilters(
    filters: GetOrdersReportDto,
  ): NormalizedReportFilters {
    const page = Math.max(
      OrdersService.DEFAULT_REPORT_PAGE,
      filters.page ?? OrdersService.DEFAULT_REPORT_PAGE,
    );
    const limit = Math.max(
      1,
      filters.limit ?? OrdersService.DEFAULT_REPORT_LIMIT,
    );

    const startDate = this.getDateBoundary(filters.startDate, 'start');
    const endDate = this.getDateBoundary(filters.endDate, 'end');

    this.ensureValidDateRange(startDate, endDate);

    return {
      tableId: filters.tableId,
      status: filters.status,
      startDate,
      endDate,
      search: filters.search?.trim() || undefined,
      page,
      limit,
      orderBy: filters.orderBy ?? OrderReportSortBy.CREATED_AT,
      orderDirection: filters.orderDirection ?? OrderReportOrderDirection.DESC,
    };
  }

  private getDateBoundary(
    value: string | undefined,
    boundary: 'start' | 'end',
  ): Date | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    const hasTimeComponent = value.includes('T');

    if (!hasTimeComponent) {
      if (boundary === 'start') {
        parsed.setUTCHours(0, 0, 0, 0);
      } else {
        parsed.setUTCHours(23, 59, 59, 999);
      }
    }

    return parsed;
  }

  private ensureValidDateRange(startDate?: Date, endDate?: Date): void {
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('startDate no puede ser mayor que endDate');
    }
  }

  private applyReportFilters(
    queryBuilder: SelectQueryBuilder<Order>,
    filters: NormalizedReportFilters,
  ): void {
    if (filters.tableId) {
      queryBuilder.andWhere('ord."tableId" = :tableId', {
        tableId: filters.tableId,
      });
    }

    if (filters.status) {
      queryBuilder.andWhere('ord.status = :status', {
        status: filters.status,
      });
    }

    if (filters.startDate) {
      queryBuilder.andWhere('ord."createdAt" >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('ord."createdAt" <= :endDate', {
        endDate: filters.endDate,
      });
    }

    if (filters.search) {
      const search = `%${filters.search}%`;

      queryBuilder.andWhere(
        `(
          ord.id::text ILIKE :search
          OR COALESCE(table.label, table.code, '') ILIKE :search
          OR COALESCE(ord.notes, '') ILIKE :search
        )`,
        { search },
      );
    }
  }

  private applyReportOrder(
    queryBuilder: SelectQueryBuilder<Order>,
    orderBy: OrderReportSortBy,
    orderDirection: OrderReportOrderDirection,
  ): void {
    switch (orderBy) {
      case OrderReportSortBy.UPDATED_AT:
        queryBuilder.orderBy('ord."updatedAt"', orderDirection);
        break;
      case OrderReportSortBy.STATUS:
        queryBuilder.orderBy('ord.status', orderDirection);
        break;
      case OrderReportSortBy.PEOPLE_COUNT:
        queryBuilder.orderBy('ord."peopleCount"', orderDirection);
        break;
      case OrderReportSortBy.TOTAL:
        queryBuilder.orderBy('ord.total', orderDirection);
        break;
      case OrderReportSortBy.TABLE:
        queryBuilder.orderBy(
          `COALESCE(table.label, table.code, 'SIN_MESA')`,
          orderDirection,
        );
        break;
      case OrderReportSortBy.CREATED_AT:
      default:
        queryBuilder.orderBy('ord."createdAt"', orderDirection);
        break;
    }

    queryBuilder.addOrderBy('ord."createdAt"', 'DESC');
  }

  private async buildMonthlySummary(
    baseQuery: SelectQueryBuilder<Order>,
  ): Promise<OrdersMonthlySummaryItem[]> {
    const rawMonthlySummary = await baseQuery
      .clone()
      .select(
        `to_char(date_trunc('month', ord."createdAt"), 'YYYY-MM')`,
        'month',
      )
      .addSelect('COUNT(ord.id)', 'totalOrders')
      .addSelect(
        `SUM(CASE WHEN ord.status = :paidStatus THEN 1 ELSE 0 END)`,
        'paidOrders',
      )
      .addSelect(
        `SUM(CASE WHEN ord.status = :cancelledStatus THEN 1 ELSE 0 END)`,
        'cancelledOrders',
      )
      .addSelect('COALESCE(SUM(ord.total), 0)', 'totalSales')
      .addSelect(
        `COALESCE(SUM(CASE WHEN ord.status = :paidStatus THEN ord.total ELSE 0 END), 0)`,
        'paidSales',
      )
      .setParameters({
        paidStatus: OrderStatus.PAID,
        cancelledStatus: OrderStatus.CANCELLED,
      })
      .groupBy(`date_trunc('month', ord."createdAt")`)
      .orderBy(`date_trunc('month', ord."createdAt")`, 'DESC')
      .getRawMany<MonthlySummaryRaw>();

    return rawMonthlySummary.map((summary) => ({
      month: summary.month,
      totalOrders: Number(summary.totalOrders ?? 0),
      paidOrders: Number(summary.paidOrders ?? 0),
      cancelledOrders: Number(summary.cancelledOrders ?? 0),
      totalSales: this.toMoney(Number(summary.totalSales ?? 0)),
      paidSales: this.toMoney(Number(summary.paidSales ?? 0)),
    }));
  }

  private async buildTotals(
    baseQuery: SelectQueryBuilder<Order>,
  ): Promise<OrdersReportTotals> {
    const totalsRaw = await baseQuery
      .clone()
      .orderBy()
      .select('COUNT(ord.id)', 'totalOrders')
      .addSelect(
        `SUM(CASE WHEN ord.status = :paidStatus THEN 1 ELSE 0 END)`,
        'paidOrders',
      )
      .addSelect(
        `SUM(CASE WHEN ord.status = :cancelledStatus THEN 1 ELSE 0 END)`,
        'cancelledOrders',
      )
      .addSelect('COALESCE(SUM(ord.total), 0)', 'totalSales')
      .addSelect(
        `COALESCE(SUM(CASE WHEN ord.status = :paidStatus THEN ord.total ELSE 0 END), 0)`,
        'paidSales',
      )
      .setParameters({
        paidStatus: OrderStatus.PAID,
        cancelledStatus: OrderStatus.CANCELLED,
      })
      .getRawOne<TotalsRaw>();

    return {
      totalOrders: Number(totalsRaw?.totalOrders ?? 0),
      paidOrders: Number(totalsRaw?.paidOrders ?? 0),
      cancelledOrders: Number(totalsRaw?.cancelledOrders ?? 0),
      totalSales: this.toMoney(Number(totalsRaw?.totalSales ?? 0)),
      paidSales: this.toMoney(Number(totalsRaw?.paidSales ?? 0)),
    };
  }

  private async refreshMonthlySummaryForOrder(
    orderSnapshot: Pick<Order, 'createdAt' | 'tableId'>,
    orderRepository: Repository<Order> = this.orderRepository,
    summaryRepository: Repository<MonthlyTableSalesSummary> = this
      .monthlySummaryRepository,
  ): Promise<void> {
    const tableId = orderSnapshot.tableId;

    if (!tableId) {
      return;
    }

    const monthKey = this.getMonthKey(orderSnapshot.createdAt);
    const { startDate, endDate } = this.getMonthRange(monthKey);

    const paidOrdersBaseQuery = orderRepository
      .createQueryBuilder('ord')
      .where('ord.status = :paidStatus', {
        paidStatus: OrderStatus.PAID,
      })
      .andWhere('ord."tableId" = :tableId', { tableId })
      .andWhere('ord."createdAt" >= :startDate', { startDate })
      .andWhere('ord."createdAt" <= :endDate', { endDate });

    const aggregationRaw = await paidOrdersBaseQuery
      .clone()
      .select('COUNT(ord.id)', 'totalOrders')
      .addSelect('COALESCE(SUM(ord.total), 0)', 'totalSales')
      .addSelect('MAX(ord."updatedAt")', 'lastOrderAt')
      .getRawOne<SummaryAggregationRaw>();

    const totalOrders = Number(aggregationRaw?.totalOrders ?? 0);

    if (totalOrders === 0) {
      await summaryRepository.delete({ monthKey, tableId });
      return;
    }

    const itemsRaw = await paidOrdersBaseQuery
      .clone()
      .leftJoin('ord.items', 'item')
      .select('COALESCE(SUM(item.quantity), 0)', 'totalItems')
      .getRawOne<SummaryItemsRaw>();

    const summaryRow =
      (await summaryRepository.findOne({
        where: {
          monthKey,
          tableId,
        },
      })) ?? summaryRepository.create({ monthKey, tableId });

    summaryRow.totalPaidOrders = totalOrders;
    summaryRow.totalPaidItems = Number(itemsRaw?.totalItems ?? 0);
    summaryRow.totalPaidSales = this.toMoney(
      Number(aggregationRaw?.totalSales ?? 0),
    );
    summaryRow.lastOrderAt = aggregationRaw?.lastOrderAt
      ? new Date(aggregationRaw.lastOrderAt)
      : null;

    await summaryRepository.save(summaryRow);
  }

  private getMonthKey(value: Date): string {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');

    return `${year}-${month}`;
  }

  private getMonthRange(monthKey: string): { startDate: Date; endDate: Date } {
    const [yearText, monthText] = monthKey.split('-');
    const year = Number(yearText);
    const month = Number(monthText);

    if (!year || !month || month < 1 || month > 12) {
      throw new BadRequestException('monthKey no es valido para el resumen');
    }

    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    return { startDate, endDate };
  }

  private async validateTableExists(
    tableId: string,
    tableRepository: Repository<RestaurantTable> = this.tableRepository,
  ): Promise<RestaurantTable> {
    const table = await tableRepository.findOneBy({ id: tableId });

    if (!table) {
      throw new NotFoundException(`Mesa con id ${tableId} no encontrada`);
    }

    return table;
  }

  private async validateReservationForOrder(
    reservationId: string,
    reservationRepository: Repository<Reservation> = this.reservationRepository,
  ): Promise<Reservation> {
    const reservation = await reservationRepository.findOneBy({
      id: reservationId,
    });

    if (!reservation) {
      throw new NotFoundException(
        `Reserva con id ${reservationId} no encontrada`,
      );
    }

    if (reservation.status !== ReservationStatus.ACTIVE) {
      throw new BadRequestException(
        'Solo se puede iniciar una orden desde reservas activas',
      );
    }

    const reservationDeadline = this.getReservationDeadline(reservation);
    if (reservationDeadline.getTime() < Date.now()) {
      throw new BadRequestException(
        'La reserva seleccionada ya vencio, extiendela o crea otra reserva',
      );
    }

    return reservation;
  }

  private getReservationDeadline(reservation: Reservation): Date {
    if (reservation.waitingUntil) {
      return reservation.waitingUntil;
    }

    return new Date(
      reservation.reservedFor.getTime() +
        OrdersService.DEFAULT_RESERVATION_WAIT_MINUTES * 60 * 1000,
    );
  }

  private async findActiveOrderByTableId(
    tableId: string,
    orderRepository: Repository<Order> = this.orderRepository,
  ): Promise<Order | null> {
    return orderRepository.findOne({
      where: {
        tableId,
        status: In(OrdersService.ACTIVE_ORDER_STATUSES),
      },
      order: { createdAt: 'DESC' },
    });
  }

  private mergeOrderNotes(
    existingNotes: string | null,
    incomingNotes?: string,
  ): string | null {
    const normalizedIncoming = incomingNotes?.trim();

    if (!normalizedIncoming) {
      return existingNotes;
    }

    if (!existingNotes?.trim()) {
      return normalizedIncoming;
    }

    return `${existingNotes}\n${normalizedIncoming}`;
  }

  private ensureActiveStatus(status: OrderStatus): OrderStatus {
    if (OrdersService.ACTIVE_ORDER_STATUSES.includes(status)) {
      return status;
    }

    return OrderStatus.OPEN;
  }

  private async syncTableStatusWithActiveOrders(
    tableId: string,
    tableRepository: Repository<RestaurantTable>,
    orderRepository: Repository<Order>,
    reservationRepository: Repository<Reservation> = this.reservationRepository,
  ): Promise<void> {
    const table = await tableRepository.findOneBy({ id: tableId });

    if (!table) {
      return;
    }

    if (table.status === TableStatus.OUT_OF_SERVICE) {
      return;
    }

    const activeOrdersCount = await orderRepository.count({
      where: {
        tableId,
        status: In(OrdersService.ACTIVE_ORDER_STATUSES),
      },
    });

    if (activeOrdersCount > 0) {
      table.status = TableStatus.OCCUPIED;
      await tableRepository.save(table);
      return;
    }

    const activeReservationsCount = await reservationRepository.count({
      where: [
        {
          tableId,
          status: ReservationStatus.ACTIVE,
          waitingUntil: MoreThanOrEqual(new Date()),
        },
        {
          tableId,
          status: ReservationStatus.ACTIVE,
          waitingUntil: IsNull(),
          reservedFor: MoreThanOrEqual(new Date()),
        },
      ],
    });

    table.status =
      activeReservationsCount > 0
        ? TableStatus.RESERVED
        : TableStatus.AVAILABLE;

    await tableRepository.save(table);
  }

  private async getProductsMapForItems(
    itemsDto: Array<CreateOrderItemDto | UpdateOrderItemDto>,
    productRepository: Repository<Product>,
    lockForUpdate = false,
  ): Promise<Map<string, Product>> {
    const productIds = [...new Set(itemsDto.map((item) => item.productId))];

    let products: Product[];

    if (lockForUpdate) {
      products = await productRepository
        .createQueryBuilder('product')
        .setLock('pessimistic_write')
        .where('product.id IN (:...productIds)', { productIds })
        .getMany();
    } else {
      products = await productRepository.find({
        where: { id: In(productIds) },
      });
    }

    if (products.length !== productIds.length) {
      const existingProductIds = new Set(products.map((product) => product.id));
      const missingProducts = productIds.filter(
        (productId) => !existingProductIds.has(productId),
      );

      throw new NotFoundException(
        `No se encontraron productos para los ids: ${missingProducts.join(', ')}`,
      );
    }

    return new Map(products.map((product) => [product.id, product]));
  }

  private discountInventory(
    itemsDto: Array<CreateOrderItemDto | UpdateOrderItemDto>,
    productMap: Map<string, Product>,
  ): void {
    const consumedByProduct = this.getConsumedQuantityByProduct(itemsDto);

    for (const [productId, consumedQuantity] of consumedByProduct) {
      const product = productMap.get(productId)!;

      if (product.currentQuantity < consumedQuantity) {
        throw new BadRequestException(
          `Stock insuficiente para ${product.name}. Disponible: ${product.currentQuantity}, solicitado: ${consumedQuantity}`,
        );
      }

      product.currentQuantity -= consumedQuantity;
    }
  }

  private getConsumedQuantityByProduct(
    itemsDto: Array<CreateOrderItemDto | UpdateOrderItemDto>,
  ): Map<string, number> {
    const consumedByProduct = new Map<string, number>();

    for (const item of itemsDto) {
      const currentConsumed = consumedByProduct.get(item.productId) ?? 0;
      consumedByProduct.set(item.productId, currentConsumed + item.quantity);
    }

    return consumedByProduct;
  }

  private buildOrderItemsFromMap(
    itemsDto: Array<CreateOrderItemDto | UpdateOrderItemDto>,
    productMap: Map<string, Product>,
    orderItemRepository: Repository<OrderItem>,
  ): OrderItem[] {
    return itemsDto.map((item) => {
      const product = productMap.get(item.productId)!;
      const unitPrice = product.price;
      const subtotal = this.toMoney(unitPrice * item.quantity);

      return orderItemRepository.create({
        productId: item.productId,
        product,
        quantity: item.quantity,
        unitPrice,
        subtotal,
        notes: item.notes ?? null,
      });
    });
  }

  private async buildOrderItems(
    itemsDto: Array<CreateOrderItemDto | UpdateOrderItemDto>,
  ): Promise<OrderItem[]> {
    const productMap = await this.getProductsMapForItems(
      itemsDto,
      this.productRepository,
    );

    return this.buildOrderItemsFromMap(
      itemsDto,
      productMap,
      this.orderItemRepository,
    );
  }

  private calculateTotal(items: OrderItem[]): number {
    return this.toMoney(items.reduce((acc, item) => acc + item.subtotal, 0));
  }

  private toMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
