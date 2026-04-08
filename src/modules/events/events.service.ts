import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateEventTicketDto,
  EventTicketMenuSelectionDto,
} from './dto/create-event-ticket.dto';
import {
  CreateEventDto,
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
  UpdateEventTicketMenuTemplateDto,
  UpdateEventTicketTypeDto,
} from './dto/update-event.dto';
import { EventTicketTypeDailyStock } from './entities/event-ticket-type-daily-stock.entity';
import {
  EventTicketMenuMode,
  EventTicketType,
} from './entities/event-ticket-type.entity';
import { EventTicket, EventTicketStatus } from './entities/event-ticket.entity';
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
  ) {}

  async create(createEventDto: CreateEventDto): Promise<Event> {
    this.validateEventDates(createEventDto.startsAt, createEventDto.endsAt);
    const isFreeEntry = createEventDto.isFreeEntry ?? false;
    const ticketTypes = createEventDto.ticketTypes ?? [];

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
      );
    }

    const totalTickets = isFreeEntry
      ? 0
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
        });

        const saved = await eventRepository.save(event);

        if (!isFreeEntry && ticketTypes.length > 0) {
          await eventTicketTypeRepository.save(
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
                menuTemplate: menuConfig.menuTemplate as Record<string, unknown> | null,
                totalStock: ticketType.totalStock ?? null,
                dailyStocks: this.mapDailyStocks(ticketType.dailyStocks),
                isPromotional: promotion.isPromotional,
                promoMinQuantity: promotion.promoMinQuantity,
                promoBundlePrice: promotion.promoBundlePrice,
              });
            }),
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
      .orderBy('event.startsAt', 'DESC')
      .addOrderBy('ticketType.name', 'ASC')
      .addOrderBy('dailyStock.date', 'ASC');

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
      },
      order: {
        ticketTypes: {
          name: 'ASC',
          dailyStocks: {
            date: 'ASC',
          },
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

    if (updateEventDto.ticketTypes) {
      this.validateTicketTypes(updateEventDto.ticketTypes, startsAt, endsAt);
    }

    if (updateEventDto.ticketTypes || isSwitchingToFreeEntry) {
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

      if (nextIsFreeEntry) {
        event.totalTickets = 0;
        event.soldTickets = 0;
      } else if (updateEventDto.ticketTypes) {
        event.totalTickets = this.calculateEventTotalTickets(
          updateEventDto.ticketTypes,
        );
        event.soldTickets = 0;
      }

      await eventRepository.save(event);

      if (nextIsFreeEntry) {
        await eventTicketTypeRepository.delete({ eventId: id });
      }

      if (updateEventDto.ticketTypes) {
        await eventTicketTypeRepository.delete({ eventId: id });

        await eventTicketTypeRepository.save(
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
              menuTemplate: menuConfig.menuTemplate as Record<string, unknown> | null,
              totalStock: ticketType.totalStock ?? null,
              dailyStocks: this.mapDailyStocks(ticketType.dailyStocks),
              isPromotional: promotion.isPromotional,
              promoMinQuantity: promotion.promoMinQuantity,
              promoBundlePrice: promotion.promoBundlePrice,
            });
          }),
        );
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
  ): Promise<EventTicket[]> {
    const event = await this.findOne(eventId);
    const quantity = createEventTicketDto.quantity ?? 1;

    this.assertEventEnabled(event.status);
    this.assertEventAllowsTickets(event);

    const ticketType = this.getTicketTypeForEvent(
      event,
      createEventTicketDto.ticketTypeId,
    );

    const attendanceDate = this.toDateOnly(createEventTicketDto.attendanceDate);

    this.assertAttendanceDateInsideEvent(attendanceDate, event);
    this.assertEventCapacityAvailable(event, true, quantity);

    await this.ensureAvailability(ticketType, attendanceDate, undefined, quantity);

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
        attendeeFirstName: createEventTicketDto.attendeeFirstName.trim(),
        attendeeLastName: createEventTicketDto.attendeeLastName.trim(),
        attendanceDate,
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

    const targetAttendanceDate = this.toDateOnly(
      updateEventTicketDto.attendanceDate ?? new Date(ticket.attendanceDate),
    );

    const targetStatus = updateEventTicketDto.status ?? ticket.status;
    const isReactivatingTicket =
      ticket.status === EventTicketStatus.CANCELLED &&
      targetStatus === EventTicketStatus.ACTIVE;

    this.assertAttendanceDateInsideEvent(targetAttendanceDate, event);
    this.assertEventCapacityAvailable(event, isReactivatingTicket);

    if (targetStatus !== EventTicketStatus.CANCELLED) {
      await this.ensureAvailability(
        targetTicketType,
        targetAttendanceDate,
        ticket.id,
      );
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
    const currentBasePrice =
      ticket.price - Number(ticket.menuExtraPrice ?? 0);
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
      price: nextBasePrice + menuSelectionResult.snapshot.totalExtraPrice,
      includesDetails: nextIncludesDetails,
      menuSelection: menuSelectionResult.normalizedSelection as Record<
        string,
        unknown
      > | null,
      menuSelectionSnapshot: menuSelectionResult.snapshot as Record<
        string,
        unknown
      >,
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
  ): void {
    const normalizedNames = new Set<string>();
    const eventStartDate = startsAt ? this.toDateOnly(startsAt) : null;
    const eventEndDate = endsAt ? this.toDateOnly(endsAt) : null;

    for (const ticketType of ticketTypes) {
      this.validateTicketTypeName(ticketType, normalizedNames);
      this.validateTicketTypeCapacityConfig(ticketType);
      this.validateTicketTypePromotion(ticketType);
      this.validateTicketTypeMenuConfiguration(ticketType);

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
      if (ticketType.menuTemplate !== undefined && ticketType.menuTemplate !== null) {
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
      menuTemplate: this.normalizeMenuTemplate(ticketType.menuTemplate, ticketType.name),
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
    const normalizedGroups = groupsRaw.map((rawGroup) => {
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
    });

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
    const normalizedGroups = groupsRaw.map((group) => {
      const normalizedGroup = this.normalizeMenuSelectionGroup(group);
      const normalizedGroupKey = normalizedGroup.groupKey.toLowerCase();

      if (uniqueGroupKeys.has(normalizedGroupKey)) {
        throw new BadRequestException(
          'La seleccion de menu contiene grupos duplicados',
        );
      }

      uniqueGroupKeys.add(normalizedGroupKey);
      return normalizedGroup;
    });

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
