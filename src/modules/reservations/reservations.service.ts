import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import {
  RestaurantTable,
  TableStatus,
} from '../layouts/entities/restaurant-table.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { GetReservationsDto } from './dto/get-reservations.dto';
import {
  UpdateReservationScheduleDayDto,
  UpdateReservationScheduleDto,
} from './dto/update-reservation-schedule.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationWeeklySchedule } from './entities/reservation-weekly-schedule.entity';
import { Reservation, ReservationStatus } from './entities/reservation.entity';

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    @InjectRepository(ReservationWeeklySchedule)
    private readonly reservationScheduleRepository: Repository<ReservationWeeklySchedule>,
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
  private static readonly SLOT_INTERVAL_MINUTES = 30;
  private static readonly MIN_SERVICE_START_MINUTES = 10 * 60;
  private static readonly MIN_ADVANCE_RESERVATION_HOURS = 4;
  private static readonly MAX_ADVANCE_RESERVATION_MONTHS = 6;
  private static readonly NO_SHOW_CANCELLATION_MINUTES = 30;

  private static readonly SCHEDULE_TIME_PATTERN =
    /^([01]\d|2[0-3]):([0-5]\d)$/;

  async create(
    createReservationDto: CreateReservationDto,
  ): Promise<Reservation> {
    await this.ensureReservationWithinSchedule(createReservationDto.reservedFor);

    const table = await this.validateTableExists(createReservationDto.tableId);

    this.ensureTableCanBeReserved(table);
    this.ensurePeopleCountFits(
      table.capacity,
      createReservationDto.peopleCount,
    );

    const reservation = this.reservationRepository.create({
      ...createReservationDto,
      holderName: createReservationDto.holderName?.trim() || null,
      email: createReservationDto.email?.trim().toLowerCase() || null,
      phone: this.normalizePhone(createReservationDto.phone),
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

    if (filters.email) {
      queryBuilder.andWhere('LOWER(reservation.email) = LOWER(:email)', {
        email: filters.email.trim(),
      });
    }

    if (filters.phone) {
      queryBuilder.andWhere('reservation.phone = :phone', {
        phone: this.normalizePhone(filters.phone),
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
      await this.ensureReservationWithinSchedule(updateReservationDto.reservedFor);
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

    if (updateReservationDto.email !== undefined) {
      reservation.email = updateReservationDto.email?.trim().toLowerCase() || null;
    }

    if (updateReservationDto.phone !== undefined) {
      reservation.phone = this.normalizePhone(updateReservationDto.phone);
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

  async getWeeklySchedule(): Promise<ReservationWeeklySchedule[]> {
    await this.ensureDefaultWeeklySchedule();

    return this.reservationScheduleRepository.find({
      order: { dayOfWeek: 'ASC' },
    });
  }

  async updateWeeklySchedule(
    updateReservationScheduleDto: UpdateReservationScheduleDto,
  ): Promise<ReservationWeeklySchedule[]> {
    await this.ensureDefaultWeeklySchedule();

    const existingSchedules = await this.reservationScheduleRepository.find({
      order: { dayOfWeek: 'ASC' },
    });

    const schedulesByDay = new Map<number, ReservationWeeklySchedule>(
      existingSchedules.map((schedule) => [schedule.dayOfWeek, schedule]),
    );

    for (const nextScheduleDay of updateReservationScheduleDto.days) {
      const schedule = schedulesByDay.get(nextScheduleDay.dayOfWeek);

      if (!schedule) {
        throw new BadRequestException(
          `No existe configuracion para el dia ${nextScheduleDay.dayOfWeek}`,
        );
      }

      const normalized = this.normalizeScheduleDay(nextScheduleDay);
      schedule.isOpen = normalized.isOpen;
      schedule.opensAt = normalized.opensAt;
      schedule.closesAt = normalized.closesAt;
    }

    await this.reservationScheduleRepository.save(existingSchedules);

    return this.getWeeklySchedule();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async cancelNoShowReservationsWithoutOrders(): Promise<void> {
    const cutoff = new Date(
      Date.now() -
        ReservationsService.NO_SHOW_CANCELLATION_MINUTES * 60 * 1000,
    );

    const candidateReservations = await this.reservationRepository.find({
      select: {
        id: true,
        tableId: true,
      },
      where: {
        status: ReservationStatus.ACTIVE,
        reservedFor: LessThanOrEqual(cutoff),
      },
    });

    if (candidateReservations.length === 0) {
      return;
    }

    const candidateReservationIds = candidateReservations.map(
      (reservation) => reservation.id,
    );

    const linkedOrders = await this.orderRepository.find({
      select: {
        reservationId: true,
      },
      where: {
        reservationId: In(candidateReservationIds),
        status: Not(OrderStatus.CANCELLED),
      },
    });

    const reservationIdsWithOrders = new Set(
      linkedOrders
        .map((order) => order.reservationId)
        .filter(
          (reservationId): reservationId is string => reservationId !== null,
        ),
    );

    const reservationsToCancel = candidateReservations.filter(
      (reservation) => !reservationIdsWithOrders.has(reservation.id),
    );

    if (reservationsToCancel.length === 0) {
      return;
    }

    const reservationIdsToCancel = reservationsToCancel.map(
      (reservation) => reservation.id,
    );

    await this.reservationRepository.update(
      { id: In(reservationIdsToCancel) },
      { status: ReservationStatus.CANCELLED },
    );

    const affectedTableIds = [...new Set(reservationsToCancel.map((reservation) => reservation.tableId))];

    await Promise.all(
      affectedTableIds.map((tableId) => this.syncTableOperationalStatus(tableId)),
    );

    this.logger.log(
      `Se cancelaron ${reservationsToCancel.length} reservas por no-show (sin orden asociada).`,
    );
  }

  private async ensureDefaultWeeklySchedule(): Promise<void> {
    const existingCount = await this.reservationScheduleRepository.count();

    if (existingCount > 0) {
      return;
    }

    const defaultSchedules = Array.from({ length: 7 }, (_, dayOfWeek) =>
      this.reservationScheduleRepository.create({
        dayOfWeek,
        isOpen: true,
        opensAt: '10:00',
        closesAt: '23:30',
      }),
    );

    await this.reservationScheduleRepository.save(defaultSchedules);
  }

  private async ensureReservationWithinSchedule(reservedFor: Date): Promise<void> {
    await this.ensureDefaultWeeklySchedule();
    this.ensureReservationAdvanceWindow(reservedFor);

    const scheduleDay = this.toScheduleDayOfWeek(reservedFor);
    const schedule = await this.reservationScheduleRepository.findOneBy({
      dayOfWeek: scheduleDay,
    });

    if (!schedule) {
      throw new BadRequestException(
        'No existe configuracion de horarios para reservas',
      );
    }

    if (!schedule.isOpen || !schedule.opensAt || !schedule.closesAt) {
      throw new BadRequestException(
        'No hay horarios disponibles para reservas en el dia seleccionado',
      );
    }

    const openMinutes = this.parseTimeToMinutes(schedule.opensAt);
    const closeMinutes = this.parseTimeToMinutes(schedule.closesAt);
    const reservationMinutes =
      reservedFor.getHours() * 60 + reservedFor.getMinutes();

    if (
      reservationMinutes < ReservationsService.MIN_SERVICE_START_MINUTES
    ) {
      throw new BadRequestException(
        'No hay atencion para reservas antes de las 10:00',
      );
    }

    const effectiveOpenMinutes = Math.max(
      openMinutes,
      ReservationsService.MIN_SERVICE_START_MINUTES,
    );

    if (
      reservationMinutes < effectiveOpenMinutes ||
      reservationMinutes > closeMinutes
    ) {
      throw new BadRequestException(
        'La hora seleccionada no esta disponible para reservas',
      );
    }

    if (
      (reservationMinutes - effectiveOpenMinutes) %
        ReservationsService.SLOT_INTERVAL_MINUTES !==
      0
    ) {
      throw new BadRequestException(
        `La reserva debe ser en intervalos de ${ReservationsService.SLOT_INTERVAL_MINUTES} minutos`,
      );
    }
  }

  private normalizeScheduleDay(
    scheduleDay: UpdateReservationScheduleDayDto,
  ): {
    isOpen: boolean;
    opensAt: string | null;
    closesAt: string | null;
  } {
    if (!scheduleDay.isOpen) {
      return {
        isOpen: false,
        opensAt: null,
        closesAt: null,
      };
    }

    if (!scheduleDay.opensAt || !scheduleDay.closesAt) {
      throw new BadRequestException(
        'Debes definir horario de apertura y cierre para dias habilitados',
      );
    }

    const normalizedOpensAt = scheduleDay.opensAt.trim();
    const normalizedClosesAt = scheduleDay.closesAt.trim();

    if (
      !ReservationsService.SCHEDULE_TIME_PATTERN.test(normalizedOpensAt) ||
      !ReservationsService.SCHEDULE_TIME_PATTERN.test(normalizedClosesAt)
    ) {
      throw new BadRequestException(
        'Los horarios deben estar en formato HH:mm',
      );
    }

    const openMinutes = this.parseTimeToMinutes(normalizedOpensAt);
    const closeMinutes = this.parseTimeToMinutes(normalizedClosesAt);

    if (openMinutes < ReservationsService.MIN_SERVICE_START_MINUTES) {
      throw new BadRequestException(
        'No se pueden configurar reservas antes de las 10:00',
      );
    }

    if (openMinutes >= closeMinutes) {
      throw new BadRequestException(
        'La hora de apertura debe ser menor que la hora de cierre',
      );
    }

    if (
      (closeMinutes - openMinutes) % ReservationsService.SLOT_INTERVAL_MINUTES !==
      0
    ) {
      throw new BadRequestException(
        `El rango horario debe ajustarse a intervalos de ${ReservationsService.SLOT_INTERVAL_MINUTES} minutos`,
      );
    }

    return {
      isOpen: true,
      opensAt: normalizedOpensAt,
      closesAt: normalizedClosesAt,
    };
  }

  private ensureReservationAdvanceWindow(reservedFor: Date): void {
    const minAllowedDate = new Date(
      Date.now() +
        ReservationsService.MIN_ADVANCE_RESERVATION_HOURS * 60 * 60 * 1000,
    );
    const maxAllowedDate = new Date();
    maxAllowedDate.setMonth(
      maxAllowedDate.getMonth() +
        ReservationsService.MAX_ADVANCE_RESERVATION_MONTHS,
    );

    if (reservedFor.getTime() < minAllowedDate.getTime()) {
      throw new BadRequestException(
        `Las reservas deben realizarse con al menos ${ReservationsService.MIN_ADVANCE_RESERVATION_HOURS} horas de anticipacion`,
      );
    }

    if (reservedFor.getTime() > maxAllowedDate.getTime()) {
      throw new BadRequestException(
        `Las reservas no pueden realizarse con mas de ${ReservationsService.MAX_ADVANCE_RESERVATION_MONTHS} meses de anticipacion`,
      );
    }
  }

  private normalizePhone(phone?: string | null): string | null {
    if (!phone) {
      return null;
    }

    const trimmed = phone.trim();

    if (trimmed.length === 0) {
      return null;
    }

    const withOnlyDigitsAndPlus = trimmed.replaceAll(/[^0-9+]/g, '');

    if (withOnlyDigitsAndPlus.startsWith('+')) {
      const sanitized = withOnlyDigitsAndPlus.slice(1).replaceAll('+', '');
      return `+${sanitized}`;
    }

    return withOnlyDigitsAndPlus.replaceAll('+', '');
  }

  private parseTimeToMinutes(value: string): number {
    const [hoursText, minutesText] = value.split(':');
    const hours = Number(hoursText);
    const minutes = Number(minutesText);

    return hours * 60 + minutes;
  }

  private toScheduleDayOfWeek(date: Date): number {
    const jsDay = date.getDay();
    return jsDay === 0 ? 6 : jsDay - 1;
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
