import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThanOrEqual, Repository } from 'typeorm';
import {
  RestaurantTable,
  TableStatus,
} from '../layouts/entities/restaurant-table.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { GetReservationsDto } from './dto/get-reservations.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { Reservation, ReservationStatus } from './entities/reservation.entity';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    @InjectRepository(RestaurantTable)
    private readonly tableRepository: Repository<RestaurantTable>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  private static readonly ACTIVE_ORDER_STATUSES: OrderStatus[] = [
    OrderStatus.OPEN,
    OrderStatus.IN_PROGRESS,
    OrderStatus.SERVED,
  ];

  private static readonly DEFAULT_WAITING_WINDOW_MINUTES = 15;

  async create(
    createReservationDto: CreateReservationDto,
  ): Promise<Reservation> {
    const table = await this.validateTableExists(createReservationDto.tableId);

    this.ensureTableCanBeReserved(table);
    this.ensurePeopleCountFits(
      table.capacity,
      createReservationDto.peopleCount,
    );

    const reservation = this.reservationRepository.create({
      ...createReservationDto,
      holderName: createReservationDto.holderName?.trim() || null,
      guestNames: (createReservationDto.guestNames ?? [])
        .map((guestName) => guestName.trim())
        .filter((guestName) => guestName.length > 0),
      notes: createReservationDto.notes?.trim() || null,
      waitingUntil: this.buildInitialWaitingDeadline(
        createReservationDto.reservedFor,
      ),
      status: ReservationStatus.ACTIVE,
    });

    const savedReservation = await this.reservationRepository.save(reservation);

    await this.syncTableOperationalStatus(savedReservation.tableId);

    return this.findOne(savedReservation.id);
  }

  async findAll(filters: GetReservationsDto): Promise<Reservation[]> {
    const queryBuilder = this.reservationRepository
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.table', 'table')
      .orderBy('reservation.reservedFor', 'ASC')
      .addOrderBy('reservation.createdAt', 'DESC');

    if (filters.tableId) {
      queryBuilder.andWhere('reservation.tableId = :tableId', {
        tableId: filters.tableId,
      });
    }

    if (filters.status) {
      queryBuilder.andWhere('reservation.status = :status', {
        status: filters.status,
      });
    }

    if (filters.startDate) {
      queryBuilder.andWhere('reservation.reservedFor >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('reservation.reservedFor <= :endDate', {
        endDate: filters.endDate,
      });
    }

    return queryBuilder.getMany();
  }

  async findOne(id: string): Promise<Reservation> {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: { table: true },
    });

    if (!reservation) {
      throw new NotFoundException(`Reserva con id ${id} no encontrada`);
    }

    return reservation;
  }

  async update(
    id: string,
    updateReservationDto: UpdateReservationDto,
  ): Promise<Reservation> {
    const reservation = await this.findOne(id);
    const previousTableId = reservation.tableId;

    if (
      updateReservationDto.tableId &&
      updateReservationDto.tableId !== reservation.tableId
    ) {
      const nextTable = await this.validateTableExists(
        updateReservationDto.tableId,
      );
      this.ensureTableCanBeReserved(nextTable);
      reservation.tableId = nextTable.id;
    }

    const targetTable = await this.validateTableExists(reservation.tableId);

    if (updateReservationDto.peopleCount !== undefined) {
      this.ensurePeopleCountFits(
        targetTable.capacity,
        updateReservationDto.peopleCount,
      );
      reservation.peopleCount = updateReservationDto.peopleCount;
    }

    if (updateReservationDto.reservedFor !== undefined) {
      reservation.reservedFor = updateReservationDto.reservedFor;

      if (updateReservationDto.waitingUntil === undefined) {
        reservation.waitingUntil = this.buildInitialWaitingDeadline(
          updateReservationDto.reservedFor,
        );
      }
    }

    if (updateReservationDto.waitingUntil !== undefined) {
      reservation.waitingUntil = updateReservationDto.waitingUntil;
    }

    if (updateReservationDto.holderName !== undefined) {
      reservation.holderName = updateReservationDto.holderName?.trim() || null;
    }

    if (updateReservationDto.guestNames !== undefined) {
      reservation.guestNames = updateReservationDto.guestNames
        .map((guestName) => guestName.trim())
        .filter((guestName) => guestName.length > 0);
    }

    if (updateReservationDto.notes !== undefined) {
      reservation.notes = updateReservationDto.notes?.trim() || null;
    }

    if (updateReservationDto.status !== undefined) {
      reservation.status = updateReservationDto.status;
    }

    const savedReservation = await this.reservationRepository.save(reservation);

    if (previousTableId !== savedReservation.tableId) {
      await this.syncTableOperationalStatus(previousTableId);
    }

    await this.syncTableOperationalStatus(savedReservation.tableId);

    return this.findOne(savedReservation.id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const reservation = await this.findOne(id);

    await this.reservationRepository.remove(reservation);
    await this.syncTableOperationalStatus(reservation.tableId);

    return { message: 'Reserva eliminada correctamente' };
  }

  private async validateTableExists(tableId: string): Promise<RestaurantTable> {
    const table = await this.tableRepository.findOneBy({ id: tableId });

    if (!table) {
      throw new NotFoundException(`Mesa con id ${tableId} no encontrada`);
    }

    return table;
  }

  private ensureTableCanBeReserved(table: RestaurantTable): void {
    if (table.status === TableStatus.OUT_OF_SERVICE) {
      throw new BadRequestException(
        'No se puede reservar una mesa no disponible',
      );
    }
  }

  private ensurePeopleCountFits(capacity: number, peopleCount: number): void {
    if (peopleCount > capacity) {
      throw new BadRequestException(
        `La reserva supera la capacidad de la mesa (${capacity})`,
      );
    }
  }

  private buildInitialWaitingDeadline(reservedFor: Date): Date {
    return new Date(
      reservedFor.getTime() +
        ReservationsService.DEFAULT_WAITING_WINDOW_MINUTES * 60 * 1000,
    );
  }

  private async syncTableOperationalStatus(tableId: string): Promise<void> {
    const table = await this.tableRepository.findOneBy({ id: tableId });

    if (!table) {
      return;
    }

    if (table.status === TableStatus.OUT_OF_SERVICE) {
      return;
    }

    const activeOrdersCount = await this.orderRepository.count({
      where: {
        tableId,
        status: In(ReservationsService.ACTIVE_ORDER_STATUSES),
      },
    });

    if (activeOrdersCount > 0) {
      table.status = TableStatus.OCCUPIED;
      await this.tableRepository.save(table);
      return;
    }

    const now = new Date();
    const activeReservationsCount = await this.reservationRepository.count({
      where: [
        {
          tableId,
          status: ReservationStatus.ACTIVE,
          waitingUntil: MoreThanOrEqual(now),
        },
        {
          tableId,
          status: ReservationStatus.ACTIVE,
          waitingUntil: IsNull(),
          reservedFor: MoreThanOrEqual(now),
        },
      ],
    });

    table.status =
      activeReservationsCount > 0
        ? TableStatus.RESERVED
        : TableStatus.AVAILABLE;

    await this.tableRepository.save(table);
  }
}
