import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  CreateEventTicketDto,
  EventTicketMenuSelectionDto,
} from './dto/create-event-ticket.dto';
import {
  CreateEventDto,
  CreateEventSessionDto,
  CreateEventTicketMenuTemplateDto,
  CreateEventTicketTypeDto,
} from './dto/create-event.dto';
import { FindEventsDto } from './dto/find-events.dto';
import { FindEventTicketsDto } from './dto/find-event-tickets.dto';
import { UpdateEventStatusDto } from './dto/update-event-status.dto';
import {
  UpdateEventTicketDto,
  UpdateEventTicketMenuSelectionDto,
} from './dto/update-event-ticket.dto';
import {
  UpdateEventDto,
  UpdateEventSessionDto,
  UpdateEventTicketMenuTemplateDto,
  UpdateEventTicketTypeDto,
} from './dto/update-event.dto';
import { EventTicketTypeDailyStock } from './entities/event-ticket-type-daily-stock.entity';
import {
  EventTicketMenuMode,
  EventTicketType,
} from './entities/event-ticket-type.entity';
import { EventTicket, EventTicketStatus } from './entities/event-ticket.entity';
import { EventSession } from './entities/event-session.entity';
import { EventSessionTicketAllocation } from './entities/event-session-ticket-allocation.entity';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { Event, EventStatus } from './entities/event.entity';

interface NormalizedMenuOption {
  id: string;
  label: string;
  extraPrice: number;
  isActive: boolean;
}

interface NormalizedMenuGroup {
  key: string;
  label: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: NormalizedMenuOption[];
}

interface NormalizedMenuTemplate {
  groups: NormalizedMenuGroup[];
}

interface NormalizedMenuSelectionGroup {
  groupKey: string;
  optionIds: string[];
}

interface NormalizedMenuSelection {
  groups: NormalizedMenuSelectionGroup[];
}

interface MenuSelectionSnapshotGroup {
  groupKey: string;
  groupLabel: string;
  selectedOptions: Array<{
    id: string;
    label: string;
    extraPrice: number;
  }>;
}

interface MenuSelectionResult {
  normalizedSelection: NormalizedMenuSelection | null;
  snapshot: {
    groups: MenuSelectionSnapshotGroup[];
    totalExtraPrice: number;
  };
}

export interface PublicEventDetailTicketType {
  id: string;
  name: string;
  description: string | null;
  price: number;
  includesDetails: string | null;
  menuMode: EventTicketType['menuMode'];
  menuTemplate: EventTicketType['menuTemplate'];
  available: boolean;
  remaining: number | null;
}

export interface PublicEventDetailSessionTicketType {
  ticketTypeId: string;
  available: boolean;
  remaining: number | null;
}

export interface PublicEventDetailSession {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  name: string | null;
  available: boolean;
  remaining: number | null;
  ticketTypes: PublicEventDetailSessionTicketType[];
}

export interface PublicEventDetail {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  officialImageUrl: string | null;
  isFreeEntry: boolean;
  hasSessions: boolean;
  ticketTypes: PublicEventDetailTicketType[];
  sessions: PublicEventDetailSession[];
}

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(EventTicketType)
    private readonly eventTicketTypeRepository: Repository<EventTicketType>,
    @InjectRepository(EventTicketTypeDailyStock)
    private readonly dailyStockRepository: Repository<EventTicketTypeDailyStock>,
    @InjectRepository(EventTicket)
    private readonly eventTicketRepository: Repository<EventTicket>,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  async create(createEventDto: CreateEventDto): Promise<Event> {
    this.validateEventDates(createEventDto.startsAt, createEventDto.endsAt);
    const isFreeEntry = createEventDto.isFreeEntry ?? false;
    const hasSessions = createEventDto.hasSessions ?? false;
    const ticketTypes = createEventDto.ticketTypes ?? [];
    const sessions = createEventDto.sessions ?? [];

    if (hasSessions && isFreeEntry) {
      throw new BadRequestException(
        'Un evento de entrada liberada no puede tener jornadas',
      );
    }

    if (hasSessions && sessions.length === 0) {
      throw new BadRequestException('Debes configurar al menos una jornada');
    }

    if (!hasSessions && sessions.length > 0) {
      throw new BadRequestException(
        'No puedes enviar jornadas si el evento no usa jornadas por dia',
      );
    }

    if (!isFreeEntry && ticketTypes.length === 0) {
      throw new BadRequestException(
        'Debes configurar al menos un tipo de ticket cuando el evento no es de entrada liberada',
      );
    }

    if (!isFreeEntry) {
      this.validateTicketTypes(
        ticketTypes,
        createEventDto.startsAt,
        createEventDto.endsAt,
        hasSessions,
      );
    }

    if (hasSessions) {
      this.validateEventSessions(
        sessions,
        ticketTypes.length,
        createEventDto.startsAt,
        createEventDto.endsAt,
      );
    }

    const totalTickets = isFreeEntry
      ? 0
      : hasSessions
        ? this.calculateSessionsTotalTickets(sessions)
        : this.calculateEventTotalTickets(ticketTypes);

    const savedEvent = await this.eventRepository.manager.transaction(
      async (entityManager) => {
        const eventRepository = entityManager.getRepository(Event);
        const eventTicketTypeRepository =
          entityManager.getRepository(EventTicketType);

        const event = eventRepository.create({
          title: createEventDto.title.trim(),
          description: this.normalizeTextToNullable(createEventDto.description),
          startsAt: createEventDto.startsAt,
          endsAt: createEventDto.endsAt,
          officialImageUrl: this.normalizeTextToNullable(
            createEventDto.officialImageUrl,
          ),
          status: createEventDto.status ?? EventStatus.ENABLED,
          totalTickets,
          soldTickets: 0,
          isFreeEntry,
          hasSessions,
        });

        const saved = await eventRepository.save(event);
        let savedTicketTypes: EventTicketType[] = [];

        if (!isFreeEntry && ticketTypes.length > 0) {
          savedTicketTypes = await eventTicketTypeRepository.save(
            ticketTypes.map((ticketType) => {
              const promotion =
                this.normalizePromotionConfiguration(ticketType);
              const menuConfig = this.normalizeMenuConfiguration(ticketType);

              return eventTicketTypeRepository.create({
                eventId: saved.id,
                name: ticketType.name.trim(),
                description: this.normalizeTextToNullable(
                  ticketType.description,
                ),
                price: ticketType.price,
                includesDetails: this.normalizeTextToNullable(
                  ticketType.includesDetails,
                ),
                menuMode: menuConfig.menuMode,
                menuTemplate: menuConfig.menuTemplate as Record<
                  string,
                  unknown
                > | null,
                totalStock: ticketType.totalStock ?? null,
                dailyStocks: this.mapDailyStocks(ticketType.dailyStocks),
                isPromotional: promotion.isPromotional,
                promoMinQuantity: promotion.promoMinQuantity,
                promoBundlePrice: promotion.promoBundlePrice,
              });
            }),
          );
        }

        if (hasSessions) {
          const sessionRepository = entityManager.getRepository(EventSession);

          await sessionRepository.save(
            this.buildSessionEntities(
              entityManager,
              saved.id,
              sessions,
              savedTicketTypes,
            ),
          );
        }

        return saved;
      },
    );

    return this.findOne(savedEvent.id);
  }

  async findAll(filters: FindEventsDto): Promise<Event[]> {
    const queryBuilder = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.ticketTypes', 'ticketType')
      .leftJoinAndSelect('ticketType.dailyStocks', 'dailyStock')
      .leftJoinAndSelect('event.sessions', 'session')
      .leftJoinAndSelect('session.allocations', 'allocation')
      .orderBy('event.startsAt', 'DESC')
      .addOrderBy('ticketType.name', 'ASC')
      .addOrderBy('dailyStock.date', 'ASC')
      .addOrderBy('session.date', 'ASC')
      .addOrderBy('session.startTime', 'ASC');

    if (filters.status) {
      queryBuilder.andWhere('event.status = :status', {
        status: filters.status,
      });
    }

    if (filters.search?.trim()) {
      queryBuilder.andWhere(
        "(event.title ILIKE :search OR COALESCE(event.description, '') ILIKE :search)",
        {
          search: `%${filters.search.trim()}%`,
        },
      );
    }

    if (filters.startDate) {
      queryBuilder.andWhere('event.startsAt >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('event.endsAt <= :endDate', {
        endDate: filters.endDate,
      });
    }

    return queryBuilder.getMany();
  }

  async findOne(id: string): Promise<Event> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: {
        ticketTypes: {
          dailyStocks: true,
        },
        sessions: {
          allocations: true,
        },
      },
      order: {
        ticketTypes: {
          name: 'ASC',
          dailyStocks: {
            date: 'ASC',
          },
        },
        sessions: {
          date: 'ASC',
          startTime: 'ASC',
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Evento con id ${id} no encontrado`);
    }

    return event;
  }

  async update(id: string, updateEventDto: UpdateEventDto): Promise<Event> {
    const event = await this.findOne(id);

    const startsAt = updateEventDto.startsAt ?? event.startsAt;
    const endsAt = updateEventDto.endsAt ?? event.endsAt;
    const nextIsFreeEntry = updateEventDto.isFreeEntry ?? event.isFreeEntry;
    const isSwitchingToFreeEntry = !event.isFreeEntry && nextIsFreeEntry;
    const nextHasSessions = updateEventDto.hasSessions ?? event.hasSessions;
    const isChangingSessionsMode = nextHasSessions !== event.hasSessions;

    if (
      isChangingSessionsMode &&
      !nextIsFreeEntry &&
      !updateEventDto.ticketTypes
    ) {
      throw new BadRequestException(
        'Para cambiar el modo de jornadas debes enviar los tipos de ticket del evento',
      );
    }

    this.validateEventDates(startsAt, endsAt);

    if (nextIsFreeEntry && updateEventDto.ticketTypes) {
      throw new BadRequestException(
        'Los eventos de entrada liberada no deben incluir tipos de ticket',
      );
    }

    if (!nextIsFreeEntry && event.isFreeEntry && !updateEventDto.ticketTypes) {
      throw new BadRequestException(
        'Para desactivar entrada liberada debes configurar los tipos de ticket del evento',
      );
    }

    if (nextHasSessions && nextIsFreeEntry) {
      throw new BadRequestException(
        'Un evento de entrada liberada no puede tener jornadas',
      );
    }

    if (updateEventDto.sessions && !updateEventDto.ticketTypes) {
      throw new BadRequestException(
        'Para actualizar jornadas debes enviar tambien los tipos de ticket',
      );
    }

    if (!nextHasSessions && updateEventDto.sessions) {
      throw new BadRequestException(
        'No puedes enviar jornadas si el evento no usa jornadas por dia',
      );
    }

    if (
      nextHasSessions &&
      updateEventDto.ticketTypes &&
      !updateEventDto.sessions
    ) {
      throw new BadRequestException(
        'Debes enviar las jornadas del evento junto a los tipos de ticket',
      );
    }

    if (updateEventDto.ticketTypes) {
      this.validateTicketTypes(
        updateEventDto.ticketTypes,
        startsAt,
        endsAt,
        nextHasSessions,
      );
    }

    if (updateEventDto.sessions) {
      this.validateEventSessions(
        updateEventDto.sessions,
        updateEventDto.ticketTypes?.length ?? 0,
        startsAt,
        endsAt,
      );
    }

    if (
      updateEventDto.ticketTypes ||
      updateEventDto.sessions ||
      isSwitchingToFreeEntry ||
      isChangingSessionsMode
    ) {
      const existingTickets = await this.eventTicketRepository.countBy({
        eventId: id,
      });

      if (existingTickets > 0) {
        throw new BadRequestException(
          'No se pueden modificar los tipos de ticket cuando ya existen tickets registrados para este evento',
        );
      }
    }

    await this.eventRepository.manager.transaction(async (entityManager) => {
      const eventRepository = entityManager.getRepository(Event);
      const eventTicketTypeRepository =
        entityManager.getRepository(EventTicketType);
      const nextDescription =
        updateEventDto.description === undefined
          ? event.description
          : this.normalizeTextToNullable(updateEventDto.description);
      const nextOfficialImageUrl =
        updateEventDto.officialImageUrl === undefined
          ? event.officialImageUrl
          : this.normalizeTextToNullable(updateEventDto.officialImageUrl);

      Object.assign(event, {
        title: updateEventDto.title?.trim() ?? event.title,
        description: nextDescription,
        startsAt,
        endsAt,
        officialImageUrl: nextOfficialImageUrl,
        status: updateEventDto.status ?? event.status,
        isFreeEntry: nextIsFreeEntry,
      });

      event.hasSessions = nextIsFreeEntry ? false : nextHasSessions;

      if (nextIsFreeEntry) {
        event.totalTickets = 0;
        event.soldTickets = 0;
      } else if (updateEventDto.ticketTypes) {
        event.totalTickets = updateEventDto.sessions
          ? this.calculateSessionsTotalTickets(updateEventDto.sessions)
          : this.calculateEventTotalTickets(updateEventDto.ticketTypes);
        event.soldTickets = 0;
      }

      await eventRepository.save(event);

      const sessionRepository = entityManager.getRepository(EventSession);

      if (nextIsFreeEntry || updateEventDto.sessions || isChangingSessionsMode) {
        await sessionRepository.delete({ eventId: id });
      }

      if (nextIsFreeEntry) {
        await eventTicketTypeRepository.delete({ eventId: id });
      }

      if (updateEventDto.ticketTypes) {
        await eventTicketTypeRepository.delete({ eventId: id });

        const savedTicketTypes = await eventTicketTypeRepository.save(
          updateEventDto.ticketTypes.map((ticketType) => {
            const promotion = this.normalizePromotionConfiguration(ticketType);
            const menuConfig = this.normalizeMenuConfiguration(ticketType);

            return eventTicketTypeRepository.create({
              eventId: id,
              name: ticketType.name.trim(),
              description: this.normalizeTextToNullable(ticketType.description),
              price: ticketType.price,
              includesDetails: this.normalizeTextToNullable(
                ticketType.includesDetails,
              ),
              menuMode: menuConfig.menuMode,
              menuTemplate: menuConfig.menuTemplate as Record<
                string,
                unknown
              > | null,
              totalStock: ticketType.totalStock ?? null,
              dailyStocks: this.mapDailyStocks(ticketType.dailyStocks),
              isPromotional: promotion.isPromotional,
              promoMinQuantity: promotion.promoMinQuantity,
              promoBundlePrice: promotion.promoBundlePrice,
            });
          }),
        );

        if (updateEventDto.sessions) {
          await sessionRepository.save(
            this.buildSessionEntities(
              entityManager,
              id,
              updateEventDto.sessions,
              savedTicketTypes,
            ),
          );
        }
      }
    });

    return this.findOne(id);
  }

  async updateStatus(
    id: string,
    updateEventStatusDto: UpdateEventStatusDto,
  ): Promise<Event> {
    const event = await this.findOne(id);

    event.status = updateEventStatusDto.status;

    await this.eventRepository.save(event);

    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const event = await this.findOne(id);

    const ticketsCount = await this.eventTicketRepository.countBy({
      eventId: id,
    });

    if (ticketsCount > 0) {
      throw new ConflictException(
        'No se puede eliminar el evento porque ya tiene tickets registrados',
      );
    }

    await this.eventRepository.remove(event);

    return {
      message: 'Evento eliminado correctamente',
    };
  }

  async createTicket(
    eventId: string,
    createEventTicketDto: CreateEventTicketDto,
    opts?: { buyerEmail?: string | null },
  ): Promise<EventTicket[]> {
    const event = await this.findOne(eventId);
    const quantity = createEventTicketDto.quantity ?? 1;

    this.assertEventEnabled(event.status);
    this.assertEventAllowsTickets(event);

    const ticketType = this.getTicketTypeForEvent(
      event,
      createEventTicketDto.ticketTypeId,
    );

    let session: EventSession | null = null;
    let attendanceDate: string;

    if (event.hasSessions) {
      if (!createEventTicketDto.sessionId) {
        throw new BadRequestException(
          'Debes seleccionar una jornada para este evento',
        );
      }

      session = this.getSessionForEvent(event, createEventTicketDto.sessionId);
      attendanceDate = this.toDateOnly(session.date);
    } else {
      if (createEventTicketDto.sessionId) {
        throw new BadRequestException('Este evento no usa jornadas por dia');
      }

      if (!createEventTicketDto.attendanceDate) {
        throw new BadRequestException('Debes indicar la fecha de asistencia');
      }

      attendanceDate = this.toDateOnly(createEventTicketDto.attendanceDate);
    }

    this.assertAttendanceDateInsideEvent(attendanceDate, event);
    this.assertEventCapacityAvailable(event, true, quantity);

    if (session) {
      await this.ensureSessionAvailability(session, ticketType, quantity);
    } else {
      await this.ensureAvailability(
        ticketType,
        attendanceDate,
        undefined,
        quantity,
      );
    }

    const basePrice = createEventTicketDto.price ?? ticketType.price;
    const unitPrices = this.buildTicketUnitPrices(
      basePrice,
      ticketType,
      quantity,
      createEventTicketDto.applyPromotion ?? false,
    );
    const menuSelectionResult = this.resolveMenuSelectionForTicket(
      ticketType,
      createEventTicketDto.menuSelection,
    );
    const includesFromPayload = this.normalizeTextToNullable(
      createEventTicketDto.includesDetails,
    );
    const includesDetails =
      includesFromPayload ??
      (ticketType.menuMode === EventTicketMenuMode.CUSTOMIZABLE
        ? this.buildMenuSelectionSummary(menuSelectionResult.snapshot)
        : ticketType.includesDetails);

    const tickets = unitPrices.map((unitPrice) =>
      this.eventTicketRepository.create({
        eventId,
        ticketTypeId: ticketType.id,
        userId: createEventTicketDto.userId ?? null,
        attendeeFirstName: createEventTicketDto.attendeeFirstName.trim(),
        attendeeLastName: createEventTicketDto.attendeeLastName.trim(),
        buyerEmail: opts?.buyerEmail ?? null,
        attendanceDate,
        sessionId: session?.id ?? null,
        price: unitPrice + menuSelectionResult.snapshot.totalExtraPrice,
        includesDetails,
        menuSelection: menuSelectionResult.normalizedSelection as Record<
          string,
          unknown
        > | null,
        menuSelectionSnapshot: menuSelectionResult.snapshot as Record<
          string,
          unknown
        >,
        menuExtraPrice: menuSelectionResult.snapshot.totalExtraPrice,
        status: EventTicketStatus.ACTIVE,
      }),
    );

    const savedTickets = await this.eventTicketRepository.save(tickets);
    await this.syncEventSoldTickets(eventId);

    // Fidelización: puntos de asistencia una vez por taller con cliente registrado.
    if (event.isWorkshop && createEventTicketDto.userId) {
      await this.loyaltyService.earnAttendance(
        createEventTicketDto.userId,
        event.id,
        event.workshopPoints,
      );
    }

    return savedTickets;
  }

  async findTickets(
    eventId: string,
    filters: FindEventTicketsDto,
  ): Promise<EventTicket[]> {
    await this.findOne(eventId);

    return this.eventTicketRepository.find({
      where: {
        eventId,
        ...(filters.ticketTypeId ? { ticketTypeId: filters.ticketTypeId } : {}),
        ...(filters.attendanceDate
          ? { attendanceDate: this.toDateOnly(filters.attendanceDate) }
          : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      order: {
        attendanceDate: 'ASC',
        createdAt: 'DESC',
      },
    });
  }

  async updateTicket(
    eventId: string,
    ticketId: string,
    updateEventTicketDto: UpdateEventTicketDto,
  ): Promise<EventTicket> {
    const ticket = await this.eventTicketRepository.findOne({
      where: {
        id: ticketId,
        eventId,
      },
    });

    if (!ticket) {
      throw new NotFoundException(
        `Ticket con id ${ticketId} no encontrado para este evento`,
      );
    }

    const event = await this.findOne(eventId);
    this.assertEventAllowsTickets(event);

    const targetTicketTypeId =
      updateEventTicketDto.ticketTypeId ?? ticket.ticketTypeId;

    const targetTicketType = this.getTicketTypeForEvent(
      event,
      targetTicketTypeId,
    );

    const targetSessionId =
      updateEventTicketDto.sessionId ?? ticket.sessionId ?? undefined;
    let targetSession: EventSession | null = null;
    let targetAttendanceDate: string;

    if (event.hasSessions) {
      if (!targetSessionId) {
        throw new BadRequestException(
          'Debes seleccionar una jornada para este evento',
        );
      }

      targetSession = this.getSessionForEvent(event, targetSessionId);
      targetAttendanceDate = this.toDateOnly(targetSession.date);
    } else {
      if (updateEventTicketDto.sessionId) {
        throw new BadRequestException('Este evento no usa jornadas por dia');
      }

      targetAttendanceDate = this.toDateOnly(
        updateEventTicketDto.attendanceDate ?? new Date(ticket.attendanceDate),
      );
    }

    const targetStatus = updateEventTicketDto.status ?? ticket.status;
    const isReactivatingTicket =
      ticket.status === EventTicketStatus.CANCELLED &&
      targetStatus === EventTicketStatus.ACTIVE;

    this.assertAttendanceDateInsideEvent(targetAttendanceDate, event);
    this.assertEventCapacityAvailable(event, isReactivatingTicket);

    if (targetStatus !== EventTicketStatus.CANCELLED) {
      if (targetSession) {
        await this.ensureSessionAvailability(
          targetSession,
          targetTicketType,
          1,
          ticket.id,
        );
      } else {
        await this.ensureAvailability(
          targetTicketType,
          targetAttendanceDate,
          ticket.id,
        );
      }
    }

    const isChangingTicketType =
      updateEventTicketDto.ticketTypeId !== undefined;
    const fallbackMenuSelection =
      updateEventTicketDto.menuSelection === undefined && !isChangingTicketType
        ? this.normalizeStoredMenuSelection(ticket.menuSelection)
        : undefined;
    const menuSelectionResult = this.resolveMenuSelectionForTicket(
      targetTicketType,
      updateEventTicketDto.menuSelection ?? fallbackMenuSelection,
    );
    const currentBasePrice = ticket.price - Number(ticket.menuExtraPrice ?? 0);
    const nextBasePrice =
      updateEventTicketDto.price ??
      (isChangingTicketType ? targetTicketType.price : currentBasePrice);

    const nextIncludesDetailsFromPayload =
      updateEventTicketDto.includesDetails === undefined
        ? undefined
        : this.normalizeTextToNullable(updateEventTicketDto.includesDetails);
    let nextIncludesDetails = ticket.includesDetails;

    if (nextIncludesDetailsFromPayload !== undefined) {
      nextIncludesDetails = nextIncludesDetailsFromPayload;
    } else if (targetTicketType.menuMode === EventTicketMenuMode.CUSTOMIZABLE) {
      nextIncludesDetails = this.buildMenuSelectionSummary(
        menuSelectionResult.snapshot,
      );
    } else if (isChangingTicketType) {
      nextIncludesDetails = targetTicketType.includesDetails;
    }

    Object.assign(ticket, {
      ticketTypeId: targetTicketType.id,
      attendeeFirstName:
        updateEventTicketDto.attendeeFirstName?.trim() ??
        ticket.attendeeFirstName,
      attendeeLastName:
        updateEventTicketDto.attendeeLastName?.trim() ??
        ticket.attendeeLastName,
      attendanceDate: targetAttendanceDate,
      sessionId: targetSession?.id ?? null,
      price: nextBasePrice + menuSelectionResult.snapshot.totalExtraPrice,
      includesDetails: nextIncludesDetails,
      menuSelection: menuSelectionResult.normalizedSelection as Record<
        string,
        unknown
      > | null,
      menuSelectionSnapshot: menuSelectionResult.snapshot,
      menuExtraPrice: menuSelectionResult.snapshot.totalExtraPrice,
      status: targetStatus,
    });

    const savedTicket = await this.eventTicketRepository.save(ticket);
    await this.syncEventSoldTickets(eventId);

    return savedTicket;
  }

  async removeTicket(
    eventId: string,
    ticketId: string,
  ): Promise<{ message: string }> {
    const ticket = await this.eventTicketRepository.findOne({
      where: {
        id: ticketId,
        eventId,
      },
    });

    if (!ticket) {
      throw new NotFoundException(
        `Ticket con id ${ticketId} no encontrado para este evento`,
      );
    }

    const shouldSyncSoldTickets = ticket.status === EventTicketStatus.ACTIVE;

    await this.eventTicketRepository.remove(ticket);

    if (shouldSyncSoldTickets) {
      await this.syncEventSoldTickets(eventId);
    }

    return {
      message: 'Ticket eliminado correctamente',
    };
  }

  private validateEventDates(startsAt: Date, endsAt: Date): void {
    if (endsAt <= startsAt) {
      throw new BadRequestException(
        'La fecha y hora de termino debe ser mayor al inicio del evento',
      );
    }
  }

  private validateTicketTypes(
    ticketTypes: Array<CreateEventTicketTypeDto | UpdateEventTicketTypeDto>,
    startsAt?: Date,
    endsAt?: Date,
    hasSessions = false,
  ): void {
    const normalizedNames = new Set<string>();
    const eventStartDate = startsAt ? this.toDateOnly(startsAt) : null;
    const eventEndDate = endsAt ? this.toDateOnly(endsAt) : null;

    for (const ticketType of ticketTypes) {
      this.validateTicketTypeName(ticketType, normalizedNames);
      this.validateTicketTypePromotion(ticketType);
      this.validateTicketTypeMenuConfiguration(ticketType);

      if (hasSessions) {
        if ((ticketType.dailyStocks ?? []).length > 0) {
          throw new BadRequestException(
            `El tipo de ticket "${ticketType.name}" no debe definir cupos por dia cuando el evento usa jornadas`,
          );
        }

        continue;
      }

      this.validateTicketTypeCapacityConfig(ticketType);

      const dailyStockTotal = this.validateTicketTypeDailyStocks(
        ticketType,
        eventStartDate,
        eventEndDate,
      );

      this.validateTicketTypeDailyTotalAgainstStock(
        ticketType,
        dailyStockTotal,
      );
    }
  }

  private validateTicketTypeName(
    ticketType: CreateEventTicketTypeDto | UpdateEventTicketTypeDto,
    normalizedNames: Set<string>,
  ): void {
    const normalizedName = ticketType.name.trim().toLowerCase();

    if (normalizedNames.has(normalizedName)) {
      throw new BadRequestException(
        'No se pueden repetir nombres de tipo de ticket en un mismo evento',
      );
    }

    normalizedNames.add(normalizedName);
  }

  private validateTicketTypeCapacityConfig(
    ticketType: CreateEventTicketTypeDto | UpdateEventTicketTypeDto,
  ): void {
    const totalStock = ticketType.totalStock ?? null;
    const dailyStocks = ticketType.dailyStocks ?? [];

    if (totalStock === null && dailyStocks.length === 0) {
      throw new BadRequestException(
        `El tipo de ticket "${ticketType.name}" debe tener cupo total o cupos por dia`,
      );
    }
  }

  private validateTicketTypeDailyStocks(
    ticketType: CreateEventTicketTypeDto | UpdateEventTicketTypeDto,
    eventStartDate: string | null,
    eventEndDate: string | null,
  ): number {
    const dailyStocks = ticketType.dailyStocks ?? [];
    const uniqueDates = new Set<string>();
    let dailyStockTotal = 0;

    for (const stock of dailyStocks) {
      const normalizedDate = this.toDateOnly(stock.date);
      dailyStockTotal += stock.quantity;

      if (uniqueDates.has(normalizedDate)) {
        throw new BadRequestException(
          `El tipo de ticket "${ticketType.name}" tiene fechas duplicadas en sus cupos diarios`,
        );
      }

      if (
        eventStartDate !== null &&
        eventEndDate !== null &&
        (normalizedDate < eventStartDate || normalizedDate > eventEndDate)
      ) {
        throw new BadRequestException(
          `El tipo de ticket "${ticketType.name}" tiene fechas fuera del rango del evento`,
        );
      }

      uniqueDates.add(normalizedDate);
    }

    return dailyStockTotal;
  }

  private validateTicketTypeDailyTotalAgainstStock(
    ticketType: CreateEventTicketTypeDto | UpdateEventTicketTypeDto,
    dailyStockTotal: number,
  ): void {
    const totalStock = ticketType.totalStock ?? null;
    const hasDailyStocks = (ticketType.dailyStocks ?? []).length > 0;

    if (totalStock !== null && hasDailyStocks && dailyStockTotal > totalStock) {
      throw new BadRequestException(
        `El tipo de ticket "${ticketType.name}" supera el cupo total configurado`,
      );
    }
  }

  private calculateEventTotalTickets(
    ticketTypes: Array<CreateEventTicketTypeDto | UpdateEventTicketTypeDto>,
  ): number {
    return ticketTypes.reduce((accumulator, ticketType) => {
      const totalStock = ticketType.totalStock ?? null;
      const dailyStockTotal = (ticketType.dailyStocks ?? []).reduce(
        (dailyAccumulator, dailyStock) =>
          dailyAccumulator + dailyStock.quantity,
        0,
      );

      if (dailyStockTotal > 0 && totalStock !== null) {
        return accumulator + Math.min(totalStock, dailyStockTotal);
      }

      if (dailyStockTotal > 0) {
        return accumulator + dailyStockTotal;
      }

      if (totalStock !== null) {
        return accumulator + totalStock;
      }

      return accumulator;
    }, 0);
  }

  private validateEventSessions(
    sessions: Array<CreateEventSessionDto | UpdateEventSessionDto>,
    ticketTypesCount: number,
    startsAt: Date,
    endsAt: Date,
  ): void {
    const eventStartDate = this.toDateOnly(startsAt);
    const eventEndDate = this.toDateOnly(endsAt);
    const uniqueSlots = new Set<string>();

    for (const session of sessions) {
      const date = this.toDateOnly(session.date);

      if (date < eventStartDate || date > eventEndDate) {
        throw new BadRequestException(
          `La jornada del ${date} esta fuera del rango del evento`,
        );
      }

      if (session.endTime && session.endTime <= session.startTime) {
        throw new BadRequestException(
          `La jornada del ${date} a las ${session.startTime} tiene hora de termino invalida`,
        );
      }

      const slotKey = `${date}|${session.startTime}`;

      if (uniqueSlots.has(slotKey)) {
        throw new BadRequestException(
          `Hay jornadas duplicadas el ${date} a las ${session.startTime}`,
        );
      }

      uniqueSlots.add(slotKey);

      const allocations = session.allocations ?? [];
      const uniqueTypeIndexes = new Set<number>();
      let allocationTotal = 0;

      for (const allocation of allocations) {
        if (allocation.ticketTypeIndex >= ticketTypesCount) {
          throw new BadRequestException(
            `La jornada del ${date} a las ${session.startTime} referencia un tipo de ticket inexistente`,
          );
        }

        if (uniqueTypeIndexes.has(allocation.ticketTypeIndex)) {
          throw new BadRequestException(
            `La jornada del ${date} a las ${session.startTime} repite cupos para un mismo tipo de ticket`,
          );
        }

        uniqueTypeIndexes.add(allocation.ticketTypeIndex);
        allocationTotal += allocation.quantity;
      }

      if (allocationTotal > session.capacity) {
        throw new BadRequestException(
          `Los cupos por tipo de la jornada del ${date} a las ${session.startTime} superan su capacidad (${session.capacity})`,
        );
      }
    }
  }

  private calculateSessionsTotalTickets(
    sessions: Array<CreateEventSessionDto | UpdateEventSessionDto>,
  ): number {
    return sessions.reduce(
      (accumulator, session) => accumulator + session.capacity,
      0,
    );
  }

  private buildSessionEntities(
    entityManager: EntityManager,
    eventId: string,
    sessions: Array<CreateEventSessionDto | UpdateEventSessionDto>,
    savedTicketTypes: EventTicketType[],
  ): EventSession[] {
    const sessionRepository = entityManager.getRepository(EventSession);
    const allocationRepository = entityManager.getRepository(
      EventSessionTicketAllocation,
    );

    return sessions.map((session) =>
      sessionRepository.create({
        eventId,
        date: this.toDateOnly(session.date),
        startTime: session.startTime,
        endTime: session.endTime ?? null,
        name: session.name ?? null,
        capacity: session.capacity,
        allocations: (session.allocations ?? []).map((allocation) =>
          allocationRepository.create({
            ticketTypeId: savedTicketTypes[allocation.ticketTypeIndex].id,
            quantity: allocation.quantity,
          }),
        ),
      }),
    );
  }

  private validateTicketTypePromotion(
    ticketType: CreateEventTicketTypeDto | UpdateEventTicketTypeDto,
  ): void {
    const isPromotional = ticketType.isPromotional ?? false;

    if (!isPromotional) {
      return;
    }

    const promoMinQuantity = ticketType.promoMinQuantity ?? 2;
    const promoBundlePrice = ticketType.promoBundlePrice ?? ticketType.price;
    const normalBundlePrice = ticketType.price * promoMinQuantity;

    if (promoBundlePrice >= normalBundlePrice) {
      throw new BadRequestException(
        `El precio promocional del ticket "${ticketType.name}" debe ser menor al precio normal por bloque`,
      );
    }
  }

  private assertEventCapacityAvailable(
    event: Event,
    shouldConsumeCapacity: boolean,
    quantity = 1,
  ): void {
    if (!shouldConsumeCapacity) {
      return;
    }

    if (
      event.totalTickets > 0 &&
      event.soldTickets + quantity > event.totalTickets
    ) {
      throw new BadRequestException(
        'No hay cupos disponibles para este evento',
      );
    }
  }

  private async syncEventSoldTickets(eventId: string): Promise<void> {
    const soldTickets = await this.eventTicketRepository.countBy({
      eventId,
      status: EventTicketStatus.ACTIVE,
    });

    await this.eventRepository.update(eventId, { soldTickets });
  }

  private mapDailyStocks(
    dailyStocks?: Array<{ date: Date; quantity: number }>,
  ) {
    return (dailyStocks ?? []).map((dailyStock) =>
      this.dailyStockRepository.create({
        date: this.toDateOnly(dailyStock.date),
        quantity: dailyStock.quantity,
      }),
    );
  }

  private normalizeTextToNullable(value?: string): string | null {
    if (value === undefined) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private getTicketTypeForEvent(
    event: Event,
    ticketTypeId: string,
  ): EventTicketType {
    const ticketType = event.ticketTypes.find(
      (item) => item.id === ticketTypeId,
    );

    if (!ticketType) {
      throw new BadRequestException(
        'El tipo de ticket seleccionado no pertenece al evento indicado',
      );
    }

    return ticketType;
  }

  private assertEventEnabled(status: EventStatus): void {
    if (status !== EventStatus.ENABLED) {
      throw new BadRequestException(
        'Solo se pueden registrar tickets en eventos habilitados',
      );
    }
  }

  private assertEventAllowsTickets(event: Event): void {
    if (event.isFreeEntry) {
      throw new BadRequestException(
        'Este evento es de entrada liberada y no requiere tickets',
      );
    }
  }

  private validateTicketTypeMenuConfiguration(
    ticketType: CreateEventTicketTypeDto | UpdateEventTicketTypeDto,
  ): void {
    this.normalizeMenuConfiguration(ticketType);
  }

  private normalizeMenuConfiguration(
    ticketType: CreateEventTicketTypeDto | UpdateEventTicketTypeDto,
  ): {
    menuMode: EventTicketMenuMode;
    menuTemplate: NormalizedMenuTemplate | null;
  } {
    const menuMode = ticketType.menuMode ?? EventTicketMenuMode.FIXED;

    if (menuMode === EventTicketMenuMode.FIXED) {
      if (
        ticketType.menuTemplate !== undefined &&
        ticketType.menuTemplate !== null
      ) {
        throw new BadRequestException(
          `El ticket "${ticketType.name}" es de menu fijo y no puede incluir plantilla de menu`,
        );
      }

      return {
        menuMode,
        menuTemplate: null,
      };
    }

    return {
      menuMode,
      menuTemplate: this.normalizeMenuTemplate(
        ticketType.menuTemplate,
        ticketType.name,
      ),
    };
  }

  private normalizeMenuTemplate(
    rawTemplate:
      | CreateEventTicketMenuTemplateDto
      | UpdateEventTicketMenuTemplateDto
      | Record<string, unknown>
      | null
      | undefined,
    ticketTypeName: string,
  ): NormalizedMenuTemplate {
    const groupsRaw = rawTemplate?.groups;

    if (!Array.isArray(groupsRaw) || groupsRaw.length === 0) {
      throw new BadRequestException(
        `El ticket "${ticketTypeName}" debe definir al menos un grupo de opciones de menu`,
      );
    }

    const uniqueGroupKeys = new Set<string>();
    const normalizedGroups = groupsRaw.map(
      (rawGroup: Parameters<typeof this.normalizeMenuTemplateGroup>[0]) => {
        const normalizedGroup = this.normalizeMenuTemplateGroup(
          rawGroup,
          ticketTypeName,
        );
        const normalizedGroupKey = normalizedGroup.key.toLowerCase();

        if (uniqueGroupKeys.has(normalizedGroupKey)) {
          throw new BadRequestException(
            `El ticket "${ticketTypeName}" repite grupos de menu con la misma clave`,
          );
        }

        uniqueGroupKeys.add(normalizedGroupKey);
        return normalizedGroup;
      },
    );

    return {
      groups: normalizedGroups,
    };
  }

  private normalizeMenuTemplateGroup(
    rawGroup: {
      key?: string;
      label?: string;
      required?: boolean;
      minSelect?: number;
      maxSelect?: number;
      options?: Array<{
        id?: string;
        label?: string;
        extraPrice?: number;
        isActive?: boolean;
      }>;
    },
    ticketTypeName: string,
  ): NormalizedMenuGroup {
    const groupKey = rawGroup.key?.trim();
    const groupLabel = rawGroup.label?.trim();

    if (!groupKey || !groupLabel) {
      throw new BadRequestException(
        `El ticket "${ticketTypeName}" tiene grupos de menu sin clave o nombre`,
      );
    }

    const options = this.normalizeMenuGroupOptions(
      rawGroup.options,
      groupLabel,
      ticketTypeName,
    );
    const activeOptions = options.filter((option) => option.isActive);
    const required = rawGroup.required ?? true;
    const minSelect = rawGroup.minSelect ?? (required ? 1 : 0);
    const maxSelect = rawGroup.maxSelect ?? 1;

    this.validateMenuGroupSelectionRules(
      groupLabel,
      ticketTypeName,
      minSelect,
      maxSelect,
      activeOptions.length,
    );

    return {
      key: groupKey,
      label: groupLabel,
      required,
      minSelect,
      maxSelect,
      options,
    };
  }

  private normalizeMenuGroupOptions(
    rawOptions:
      | Array<{
          id?: string;
          label?: string;
          extraPrice?: number;
          isActive?: boolean;
        }>
      | undefined,
    groupLabel: string,
    ticketTypeName: string,
  ): NormalizedMenuOption[] {
    if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
      throw new BadRequestException(
        `El grupo "${groupLabel}" del ticket "${ticketTypeName}" no tiene opciones`,
      );
    }

    const uniqueOptionIds = new Set<string>();
    const options = rawOptions.map((rawOption) => {
      const optionId = rawOption.id?.trim();
      const optionLabel = rawOption.label?.trim();

      if (!optionId || !optionLabel) {
        throw new BadRequestException(
          `El grupo "${groupLabel}" del ticket "${ticketTypeName}" tiene opciones sin id o nombre`,
        );
      }

      const normalizedOptionId = optionId.toLowerCase();

      if (uniqueOptionIds.has(normalizedOptionId)) {
        throw new BadRequestException(
          `El grupo "${groupLabel}" del ticket "${ticketTypeName}" repite opciones`,
        );
      }

      uniqueOptionIds.add(normalizedOptionId);

      const extraPrice = Number(rawOption.extraPrice ?? 0);

      if (Number.isNaN(extraPrice) || extraPrice < 0) {
        throw new BadRequestException(
          `La opcion "${optionLabel}" del ticket "${ticketTypeName}" tiene un recargo invalido`,
        );
      }

      return {
        id: optionId,
        label: optionLabel,
        extraPrice,
        isActive: rawOption.isActive ?? true,
      };
    });

    if (!options.some((option) => option.isActive)) {
      throw new BadRequestException(
        `El grupo "${groupLabel}" del ticket "${ticketTypeName}" no tiene opciones activas`,
      );
    }

    return options;
  }

  private validateMenuGroupSelectionRules(
    groupLabel: string,
    ticketTypeName: string,
    minSelect: number,
    maxSelect: number,
    activeOptionsCount: number,
  ): void {
    if (!Number.isInteger(minSelect) || minSelect < 0) {
      throw new BadRequestException(
        `El grupo "${groupLabel}" del ticket "${ticketTypeName}" tiene un minimo de seleccion invalido`,
      );
    }

    if (!Number.isInteger(maxSelect) || maxSelect < 1) {
      throw new BadRequestException(
        `El grupo "${groupLabel}" del ticket "${ticketTypeName}" tiene un maximo de seleccion invalido`,
      );
    }

    if (minSelect > maxSelect) {
      throw new BadRequestException(
        `El grupo "${groupLabel}" del ticket "${ticketTypeName}" tiene un minimo mayor al maximo permitido`,
      );
    }

    if (activeOptionsCount < minSelect) {
      throw new BadRequestException(
        `El grupo "${groupLabel}" del ticket "${ticketTypeName}" no tiene suficientes opciones activas para su minimo de seleccion`,
      );
    }

    if (maxSelect > activeOptionsCount) {
      throw new BadRequestException(
        `El grupo "${groupLabel}" del ticket "${ticketTypeName}" supera la cantidad de opciones activas disponibles`,
      );
    }
  }

  private normalizeStoredMenuSelection(
    rawSelection: Record<string, unknown> | null,
  ): NormalizedMenuSelection | undefined {
    if (rawSelection === null) {
      return undefined;
    }

    return this.normalizeMenuSelection(rawSelection);
  }

  private normalizeMenuSelection(
    rawSelection:
      | EventTicketMenuSelectionDto
      | UpdateEventTicketMenuSelectionDto
      | NormalizedMenuSelection
      | Record<string, unknown>,
  ): NormalizedMenuSelection {
    const groupsRaw = rawSelection.groups;

    if (!Array.isArray(groupsRaw)) {
      throw new BadRequestException(
        'La seleccion de menu enviada no tiene un formato valido',
      );
    }

    const uniqueGroupKeys = new Set<string>();
    const normalizedGroups = groupsRaw.map(
      (group: Parameters<typeof this.normalizeMenuSelectionGroup>[0]) => {
        const normalizedGroup = this.normalizeMenuSelectionGroup(group);
        const normalizedGroupKey = normalizedGroup.groupKey.toLowerCase();

        if (uniqueGroupKeys.has(normalizedGroupKey)) {
          throw new BadRequestException(
            'La seleccion de menu contiene grupos duplicados',
          );
        }

        uniqueGroupKeys.add(normalizedGroupKey);
        return normalizedGroup;
      },
    );

    return {
      groups: normalizedGroups,
    };
  }

  private normalizeMenuSelectionGroup(group: {
    groupKey?: string;
    optionIds?: string[];
  }): NormalizedMenuSelectionGroup {
    const groupKey = group.groupKey?.trim();

    if (!groupKey) {
      throw new BadRequestException(
        'La seleccion de menu contiene un grupo sin clave',
      );
    }

    if (!Array.isArray(group.optionIds)) {
      throw new BadRequestException(
        `La seleccion del grupo "${groupKey}" no contiene opciones validas`,
      );
    }

    const uniqueOptionIds = new Set<string>();
    const optionIds = group.optionIds
      .map((optionIdRaw) => optionIdRaw?.trim())
      .filter((optionId): optionId is string => Boolean(optionId))
      .filter((optionId) => {
        const normalizedOptionId = optionId.toLowerCase();

        if (uniqueOptionIds.has(normalizedOptionId)) {
          return false;
        }

        uniqueOptionIds.add(normalizedOptionId);
        return true;
      });

    return {
      groupKey,
      optionIds,
    };
  }

  private resolveMenuSelectionForTicket(
    ticketType: EventTicketType,
    rawSelection?:
      | EventTicketMenuSelectionDto
      | UpdateEventTicketMenuSelectionDto
      | NormalizedMenuSelection,
  ): MenuSelectionResult {
    if (ticketType.menuMode !== EventTicketMenuMode.CUSTOMIZABLE) {
      return this.resolveFixedMenuSelection(rawSelection);
    }

    const template = this.normalizeMenuTemplate(
      ticketType.menuTemplate,
      ticketType.name,
    );

    if (!rawSelection) {
      throw new BadRequestException(
        'Este tipo de ticket requiere seleccionar opciones del menu personalizado',
      );
    }

    const normalizedSelection = this.normalizeMenuSelection(rawSelection);
    this.assertSelectionGroupsExistInTemplate(normalizedSelection, template);
    return this.resolveCustomMenuSelection(normalizedSelection, template);
  }

  private resolveFixedMenuSelection(
    rawSelection?:
      | EventTicketMenuSelectionDto
      | UpdateEventTicketMenuSelectionDto
      | NormalizedMenuSelection,
  ): MenuSelectionResult {
    if (rawSelection) {
      const normalizedSelection = this.normalizeMenuSelection(rawSelection);

      if (normalizedSelection.groups.length > 0) {
        throw new BadRequestException(
          'Este tipo de ticket no acepta seleccion de menu personalizada',
        );
      }
    }

    return {
      normalizedSelection: null,
      snapshot: {
        groups: [],
        totalExtraPrice: 0,
      },
    };
  }

  private assertSelectionGroupsExistInTemplate(
    normalizedSelection: NormalizedMenuSelection,
    template: NormalizedMenuTemplate,
  ): void {
    const templateGroupKeys = new Set(
      template.groups.map((group) => group.key.toLowerCase()),
    );

    for (const selectionGroup of normalizedSelection.groups) {
      if (!templateGroupKeys.has(selectionGroup.groupKey.toLowerCase())) {
        throw new BadRequestException(
          `El grupo "${selectionGroup.groupKey}" no existe en el menu de este ticket`,
        );
      }
    }
  }

  private resolveCustomMenuSelection(
    normalizedSelection: NormalizedMenuSelection,
    template: NormalizedMenuTemplate,
  ): MenuSelectionResult {
    const selectionByGroup = new Map<string, string[]>();

    for (const selectionGroup of normalizedSelection.groups) {
      const normalizedGroupKey = selectionGroup.groupKey.toLowerCase();

      if (selectionByGroup.has(normalizedGroupKey)) {
        throw new BadRequestException(
          `El grupo "${selectionGroup.groupKey}" esta repetido en la seleccion`,
        );
      }

      selectionByGroup.set(normalizedGroupKey, selectionGroup.optionIds);
    }

    const normalizedGroups: NormalizedMenuSelectionGroup[] = [];
    const snapshotGroups: MenuSelectionSnapshotGroup[] = [];
    let totalExtraPrice = 0;

    for (const templateGroup of template.groups) {
      const result = this.resolveTemplateGroupSelection(
        templateGroup,
        selectionByGroup.get(templateGroup.key.toLowerCase()) ?? [],
      );

      if (result.normalizedGroup) {
        normalizedGroups.push(result.normalizedGroup);
      }

      snapshotGroups.push(result.snapshotGroup);
      totalExtraPrice += result.extraPrice;
    }

    return {
      normalizedSelection: {
        groups: normalizedGroups,
      },
      snapshot: {
        groups: snapshotGroups,
        totalExtraPrice,
      },
    };
  }

  private resolveTemplateGroupSelection(
    templateGroup: NormalizedMenuGroup,
    selectedOptionIds: string[],
  ): {
    normalizedGroup: NormalizedMenuSelectionGroup | null;
    snapshotGroup: MenuSelectionSnapshotGroup;
    extraPrice: number;
  } {
    if (selectedOptionIds.length < templateGroup.minSelect) {
      throw new BadRequestException(
        `Debes seleccionar al menos ${templateGroup.minSelect} opcion(es) en "${templateGroup.label}"`,
      );
    }

    if (selectedOptionIds.length > templateGroup.maxSelect) {
      throw new BadRequestException(
        `Solo puedes seleccionar hasta ${templateGroup.maxSelect} opcion(es) en "${templateGroup.label}"`,
      );
    }

    const optionById = new Map<string, NormalizedMenuOption>();

    for (const option of templateGroup.options) {
      optionById.set(option.id.toLowerCase(), option);
    }

    const selectedOptions: MenuSelectionSnapshotGroup['selectedOptions'] = [];
    const normalizedOptionIds: string[] = [];
    let extraPrice = 0;

    for (const optionId of selectedOptionIds) {
      const selectedOption = optionById.get(optionId.toLowerCase());

      if (!selectedOption?.isActive) {
        throw new BadRequestException(
          `La opcion "${optionId}" no esta disponible para "${templateGroup.label}"`,
        );
      }

      normalizedOptionIds.push(selectedOption.id);
      selectedOptions.push({
        id: selectedOption.id,
        label: selectedOption.label,
        extraPrice: selectedOption.extraPrice,
      });
      extraPrice += selectedOption.extraPrice;
    }

    return {
      normalizedGroup:
        selectedOptions.length > 0
          ? {
              groupKey: templateGroup.key,
              optionIds: normalizedOptionIds,
            }
          : null,
      snapshotGroup: {
        groupKey: templateGroup.key,
        groupLabel: templateGroup.label,
        selectedOptions,
      },
      extraPrice,
    };
  }

  private buildMenuSelectionSummary(snapshot: {
    groups: MenuSelectionSnapshotGroup[];
  }): string | null {
    const groupSummaries = snapshot.groups
      .filter((group) => group.selectedOptions.length > 0)
      .map((group) => {
        const selectedLabels = group.selectedOptions
          .map((option) => option.label)
          .join(', ');

        return `${group.groupLabel}: ${selectedLabels}`;
      });

    if (groupSummaries.length === 0) {
      return null;
    }

    return groupSummaries.join(' | ');
  }

  private normalizePromotionConfiguration(
    ticketType: CreateEventTicketTypeDto | UpdateEventTicketTypeDto,
  ): {
    isPromotional: boolean;
    promoMinQuantity: number | null;
    promoBundlePrice: number | null;
  } {
    const isPromotional = ticketType.isPromotional ?? false;

    if (!isPromotional) {
      return {
        isPromotional: false,
        promoMinQuantity: null,
        promoBundlePrice: null,
      };
    }

    return {
      isPromotional: true,
      promoMinQuantity: ticketType.promoMinQuantity ?? 2,
      promoBundlePrice: ticketType.promoBundlePrice ?? ticketType.price,
    };
  }

  private buildTicketUnitPrices(
    basePrice: number,
    ticketType: EventTicketType,
    quantity: number,
    applyPromotion: boolean,
  ): number[] {
    if (!applyPromotion) {
      return Array.from({ length: quantity }, () => basePrice);
    }

    if (
      !ticketType.isPromotional ||
      ticketType.promoMinQuantity === null ||
      ticketType.promoBundlePrice === null
    ) {
      throw new BadRequestException(
        'El tipo de ticket seleccionado no tiene una promocion valida',
      );
    }

    const promoMinQuantity = ticketType.promoMinQuantity;
    const promoBundlePrice = Number(ticketType.promoBundlePrice);

    if (quantity < promoMinQuantity) {
      throw new BadRequestException(
        `Debes registrar al menos ${promoMinQuantity} tickets para aplicar esta promocion`,
      );
    }

    const promoBlocks = Math.floor(quantity / promoMinQuantity);
    const promoTicketsCount = promoBlocks * promoMinQuantity;
    const promoUnitPrice = promoBundlePrice / promoMinQuantity;

    return Array.from({ length: quantity }, (_, index) =>
      index < promoTicketsCount ? promoUnitPrice : basePrice,
    );
  }

  private assertAttendanceDateInsideEvent(
    attendanceDate: string,
    event: Event,
  ): void {
    const eventStartDate = this.toDateOnly(event.startsAt);
    const eventEndDate = this.toDateOnly(event.endsAt);

    if (attendanceDate < eventStartDate || attendanceDate > eventEndDate) {
      throw new BadRequestException(
        'La fecha de asistencia debe estar dentro del rango del evento',
      );
    }
  }

  private async ensureAvailability(
    ticketType: EventTicketType,
    attendanceDate: string,
    excludeTicketId?: string,
    quantity = 1,
  ): Promise<void> {
    const activeStatus = EventTicketStatus.ACTIVE;

    const ticketsForDayQuery = this.eventTicketRepository
      .createQueryBuilder('ticket')
      .where('ticket.ticketTypeId = :ticketTypeId', {
        ticketTypeId: ticketType.id,
      })
      .andWhere('ticket.status = :status', { status: activeStatus })
      .andWhere('ticket.attendanceDate = :attendanceDate', { attendanceDate });

    if (excludeTicketId) {
      ticketsForDayQuery.andWhere('ticket.id <> :excludeTicketId', {
        excludeTicketId,
      });
    }

    const soldForDay = await ticketsForDayQuery.getCount();

    const dailyStocks = ticketType.dailyStocks ?? [];

    if (dailyStocks.length > 0) {
      const dailyStock = dailyStocks.find(
        (stock) => this.toDateOnly(stock.date) === attendanceDate,
      );

      if (!dailyStock) {
        throw new BadRequestException(
          'No hay cupo configurado para la fecha de asistencia seleccionada',
        );
      }

      if (soldForDay + quantity > dailyStock.quantity) {
        throw new BadRequestException(
          'No hay cupos disponibles para este tipo de ticket en la fecha seleccionada',
        );
      }
    }

    if (ticketType.totalStock !== null) {
      const ticketsTotalQuery = this.eventTicketRepository
        .createQueryBuilder('ticket')
        .where('ticket.ticketTypeId = :ticketTypeId', {
          ticketTypeId: ticketType.id,
        })
        .andWhere('ticket.status = :status', { status: activeStatus });

      if (excludeTicketId) {
        ticketsTotalQuery.andWhere('ticket.id <> :excludeTicketId', {
          excludeTicketId,
        });
      }

      const soldTotal = await ticketsTotalQuery.getCount();

      if (soldTotal + quantity > ticketType.totalStock) {
        throw new BadRequestException(
          'No hay cupo total disponible para este tipo de ticket',
        );
      }
    }
  }

  private getSessionForEvent(event: Event, sessionId: string): EventSession {
    const session = (event.sessions ?? []).find(
      (item) => item.id === sessionId,
    );

    if (!session) {
      throw new BadRequestException(
        'La jornada seleccionada no pertenece al evento indicado',
      );
    }

    return session;
  }

  private async countActiveTickets(
    where: { sessionId?: string; ticketTypeId?: string },
    excludeTicketId?: string,
  ): Promise<number> {
    const query = this.eventTicketRepository
      .createQueryBuilder('ticket')
      .where('ticket.status = :status', {
        status: EventTicketStatus.ACTIVE,
      });

    if (where.sessionId) {
      query.andWhere('ticket.sessionId = :sessionId', {
        sessionId: where.sessionId,
      });
    }

    if (where.ticketTypeId) {
      query.andWhere('ticket.ticketTypeId = :ticketTypeId', {
        ticketTypeId: where.ticketTypeId,
      });
    }

    if (excludeTicketId) {
      query.andWhere('ticket.id <> :excludeTicketId', { excludeTicketId });
    }

    return query.getCount();
  }

  private async ensureSessionAvailability(
    session: EventSession,
    ticketType: EventTicketType,
    quantity = 1,
    excludeTicketId?: string,
  ): Promise<void> {
    const soldForSession = await this.countActiveTickets(
      { sessionId: session.id },
      excludeTicketId,
    );

    if (soldForSession + quantity > session.capacity) {
      throw new BadRequestException(
        `No hay cupos disponibles para la jornada del ${session.date} a las ${session.startTime}`,
      );
    }

    const allocation = (session.allocations ?? []).find(
      (item) => item.ticketTypeId === ticketType.id,
    );

    if (allocation) {
      const soldForType = await this.countActiveTickets(
        { sessionId: session.id, ticketTypeId: ticketType.id },
        excludeTicketId,
      );

      if (soldForType + quantity > allocation.quantity) {
        throw new BadRequestException(
          `No hay cupos disponibles para el tipo "${ticketType.name}" en esta jornada`,
        );
      }
    }

    if (ticketType.totalStock !== null) {
      const soldTotal = await this.countActiveTickets(
        { ticketTypeId: ticketType.id },
        excludeTicketId,
      );

      if (soldTotal + quantity > ticketType.totalStock) {
        throw new BadRequestException(
          'No hay cupo total disponible para este tipo de ticket',
        );
      }
    }
  }

  // ponytail: getRemainingForType/getRemainingForSession mirror the throw-logic in
  // ensureAvailability/ensureSessionAvailability above (read-only, no exceptions).
  // Keep the two pairs in sync; unify if they drift.
  private async getRemainingForType(
    ticketType: EventTicketType,
    attendanceDate: string,
  ): Promise<number | null> {
    const layers: number[] = [];

    const dailyStocks = ticketType.dailyStocks ?? [];
    if (dailyStocks.length > 0) {
      const dailyStock = dailyStocks.find(
        (stock) => this.toDateOnly(stock.date) === attendanceDate,
      );
      if (!dailyStock) return 0; // sin cupo configurado para ese día
      const soldForDay = await this.eventTicketRepository
        .createQueryBuilder('ticket')
        .where('ticket.ticketTypeId = :ticketTypeId', { ticketTypeId: ticketType.id })
        .andWhere('ticket.status = :status', { status: EventTicketStatus.ACTIVE })
        .andWhere('ticket.attendanceDate = :attendanceDate', { attendanceDate })
        .getCount();
      layers.push(Math.max(0, dailyStock.quantity - soldForDay));
    }

    if (ticketType.totalStock !== null) {
      const soldTotal = await this.countActiveTickets({ ticketTypeId: ticketType.id });
      layers.push(Math.max(0, ticketType.totalStock - soldTotal));
    }

    return layers.length ? Math.min(...layers) : null;
  }

  private async getRemainingForSession(
    session: EventSession,
    ticketType: EventTicketType,
  ): Promise<number | null> {
    const layers: number[] = [];

    const soldForSession = await this.countActiveTickets({ sessionId: session.id });
    layers.push(Math.max(0, session.capacity - soldForSession));

    const allocation = (session.allocations ?? []).find(
      (item) => item.ticketTypeId === ticketType.id,
    );
    if (allocation) {
      const soldForType = await this.countActiveTickets({
        sessionId: session.id,
        ticketTypeId: ticketType.id,
      });
      layers.push(Math.max(0, allocation.quantity - soldForType));
    }

    if (ticketType.totalStock !== null) {
      const soldTotal = await this.countActiveTickets({ ticketTypeId: ticketType.id });
      layers.push(Math.max(0, ticketType.totalStock - soldTotal));
    }

    return layers.length ? Math.min(...layers) : null;
  }

  async getPublicDetail(id: string): Promise<PublicEventDetail> {
    const event = await this.findOne(id);
    if (event.status !== EventStatus.ENABLED) {
      throw new NotFoundException('Evento no encontrado');
    }

    const ticketTypes: PublicEventDetailTicketType[] = [];
    for (const t of event.ticketTypes ?? []) {
      // fecha de referencia para stock diario: inicio del evento
      const remaining = await this.getRemainingForType(
        t,
        this.toDateOnly(event.startsAt),
      );
      ticketTypes.push({
        id: t.id,
        name: t.name,
        description: t.description,
        price: t.price,
        includesDetails: t.includesDetails,
        menuMode: t.menuMode,
        menuTemplate: t.menuTemplate,
        remaining,
        available: event.isFreeEntry || remaining === null || remaining > 0,
      });
    }

    const sessions: PublicEventDetailSession[] = [];
    for (const s of event.sessions ?? []) {
      const perType: PublicEventDetailSessionTicketType[] = [];
      for (const t of event.ticketTypes ?? []) {
        const remaining = await this.getRemainingForSession(s, t);
        perType.push({
          ticketTypeId: t.id,
          remaining,
          available: event.isFreeEntry || remaining === null || remaining > 0,
        });
      }
      const sessionRemaining = perType.reduce<number | null>((acc, pt) => {
        if (pt.remaining === null) return acc;
        return acc === null ? pt.remaining : Math.min(acc, pt.remaining);
      }, null);
      sessions.push({
        id: s.id,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        name: s.name ?? null,
        remaining: sessionRemaining,
        available:
          event.isFreeEntry ||
          perType.some((pt) => pt.available),
        ticketTypes: perType,
      });
    }

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      officialImageUrl: event.officialImageUrl,
      isFreeEntry: event.isFreeEntry,
      hasSessions: event.hasSessions,
      ticketTypes,
      sessions,
    };
  }

  private toDateOnly(date: Date | string): string {
    if (typeof date === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date;
      }

      return new Date(date).toISOString().slice(0, 10);
    }

    return date.toISOString().slice(0, 10);
  }
}
