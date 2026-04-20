import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
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

export interface PublicMenuItem {
  id: string;
  code: string;
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

@Injectable()
export class PublicService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(RestaurantTable)
    private readonly tableRepository: Repository<RestaurantTable>,
    private readonly reservationsService: ReservationsService,
  ) {}

  async findMenu(): Promise<PublicMenuItem[]> {
    const products = await this.productRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });

    return products.map((product) => ({
      id: product.id,
      code: product.code,
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
    return reservations.map((reservation) => this.toPublicReservation(reservation));
  }

  async findReservationSchedule(): Promise<PublicReservationScheduleItem[]> {
    const schedules = await this.reservationsService.getWeeklySchedule();
    return schedules.map((schedule) => this.toPublicSchedule(schedule));
  }

  async createReservation(
    createReservationDto: PublicCreateReservationDto,
  ): Promise<PublicReservationItem> {
    const reservation = await this.reservationsService.create(createReservationDto);
    return this.toPublicReservation(reservation);
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
