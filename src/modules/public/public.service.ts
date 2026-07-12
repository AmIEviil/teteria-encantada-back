import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Event, EventStatus } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import type {
  PublicEventDetail,
  PublicPurchaseResult,
} from '../events/events.service';
import {
  RestaurantTable,
  TableStatus,
} from '../layouts/entities/restaurant-table.entity';
import { Product } from '../products/entities/product.entity';
import { ReservationWeeklySchedule } from '../reservations/entities/reservation-weekly-schedule.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { ReservationsService } from '../reservations/reservations.service';
import { PublicCreateReservationDto } from './dto/public-create-reservation.dto';
import { PublicFindReservationsDto } from './dto/public-find-reservations.dto';
import { PublicPurchaseDto } from './dto/public-purchase.dto';

export interface PublicMenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
}

export interface PublicTableItem {
  id: string;
  code: string;
  label: string | null;
  capacity: number;
  status: TableStatus;
}

export interface PublicReservationItem {
  id: string;
  tableId: string;
  tableCode: string;
  tableLabel: string | null;
  reservedFor: Date;
  peopleCount: number;
  holderName: string | null;
  email: string | null;
  phone: string | null;
  guestNames: string[];
  notes: string | null;
  waitingUntil: Date | null;
  status: Reservation['status'];
  createdAt: Date;
}

export interface PublicReservationScheduleItem {
  dayOfWeek: number;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export interface PublicEventScheduleItem {
  date: string;
  startTime: string;
  endTime: string | null;
}

export interface PublicEventItem {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  schedules: PublicEventScheduleItem[];
  ticketsAvailable: boolean;
}

@Injectable()
export class PublicService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(RestaurantTable)
    private readonly tableRepository: Repository<RestaurantTable>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly reservationsService: ReservationsService,
    private readonly eventsService: EventsService,
  ) {}

  async findEvents(): Promise<PublicEventItem[]> {
    const events = await this.eventRepository.find({
      where: { status: EventStatus.ENABLED },
      relations: { sessions: true },
      order: { startsAt: 'DESC' }, // más reciente -> más antiguo
    });

    return events.map((event) => this.toPublicEvent(event));
  }

  async findMenu(): Promise<PublicMenuItem[]> {
    const products = await this.productRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
    }));
  }

  async findTables(): Promise<PublicTableItem[]> {
    const tables = await this.tableRepository.find({
      where: { status: Not(TableStatus.OUT_OF_SERVICE) },
      order: { code: 'ASC' },
    });

    return tables.map((table) => ({
      id: table.id,
      code: table.code,
      label: table.label,
      capacity: table.capacity,
      status: table.status,
    }));
  }

  async findReservations(
    filters: PublicFindReservationsDto,
  ): Promise<PublicReservationItem[]> {
    if (!filters.email && !filters.phone) {
      throw new BadRequestException(
        'Debes indicar un correo o numero de telefono para buscar reservas',
      );
    }

    const reservations = await this.reservationsService.findAll(filters);
    return reservations.map((reservation) =>
      this.toPublicReservation(reservation),
    );
  }

  async findReservationSchedule(): Promise<PublicReservationScheduleItem[]> {
    const schedules = await this.reservationsService.getWeeklySchedule();
    return schedules.map((schedule) => this.toPublicSchedule(schedule));
  }

  async createReservation(
    createReservationDto: PublicCreateReservationDto,
  ): Promise<PublicReservationItem> {
    const reservation =
      await this.reservationsService.create(createReservationDto);
    return this.toPublicReservation(reservation);
  }

  findEvent(id: string): Promise<PublicEventDetail> {
    return this.eventsService.getPublicDetail(id);
  }

  purchase(id: string, dto: PublicPurchaseDto): Promise<PublicPurchaseResult> {
    return this.eventsService.createPublicTickets(id, {
      buyerEmail: dto.buyerEmail,
      items: dto.items.map((item) => ({
        ticketTypeId: item.ticketTypeId,
        sessionId: item.sessionId,
        attendanceDate: item.attendanceDate,
        attendeeFirstName: item.attendeeFirstName,
        attendeeLastName: item.attendeeLastName,
        menuSelection: item.menuSelection,
      })),
    });
  }

  private toPublicReservation(reservation: Reservation): PublicReservationItem {
    return {
      id: reservation.id,
      tableId: reservation.tableId,
      tableCode: reservation.table?.code ?? '',
      tableLabel: reservation.table?.label ?? null,
      reservedFor: reservation.reservedFor,
      peopleCount: reservation.peopleCount,
      holderName: reservation.holderName,
      email: reservation.email,
      phone: reservation.phone,
      guestNames: reservation.guestNames,
      notes: reservation.notes,
      waitingUntil: reservation.waitingUntil ?? null,
      status: reservation.status,
      createdAt: reservation.createdAt,
    };
  }

  private toPublicEvent(event: Event): PublicEventItem {
    const schedules = (event.sessions ?? [])
      .slice()
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
      )
      .map((session) => ({
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
      }));

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      schedules,
      ticketsAvailable: this.hasTicketsAvailable(event),
    };
  }

  private hasTicketsAvailable(event: Event): boolean {
    // ponytail: chequeo a nivel de evento. Un día/jornada puntual puede estar
    // agotado aunque esto siga en true. Reflejar ensureAvailability por
    // tipo/día/sesión si se necesita esa precisión.
    if (event.isFreeEntry) return true;
    if (event.totalTickets === 0) return true; // sin cupo definido = sin límite
    return event.soldTickets < event.totalTickets;
  }

  private toPublicSchedule(
    schedule: ReservationWeeklySchedule,
  ): PublicReservationScheduleItem {
    return {
      dayOfWeek: schedule.dayOfWeek,
      isOpen: schedule.isOpen,
      opensAt: schedule.opensAt,
      closesAt: schedule.closesAt,
    };
  }
}
