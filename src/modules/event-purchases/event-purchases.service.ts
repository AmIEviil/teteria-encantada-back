import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { EventPurchase } from '../events/entities/event-purchase.entity';
import { Event } from '../events/entities/event.entity';
import { EventTicketType } from '../events/entities/event-ticket-type.entity';
import { DiskStorageService } from '../images/storage/disk-storage.service';
import { GetEventPurchasesDto } from './dto/get-event-purchases.dto';
import {
  EventPurchaseDetail,
  EventPurchaseRow,
  EventPurchasesListResponse,
} from './dto/event-purchases-response.dto';

const INTERNAL_PREFIX = 'INTERNAL_';
const SANTIAGO_DATE = `(p."createdAt" AT TIME ZONE 'America/Santiago')::date`;

export type EventPurchaseFileKind = 'tickets' | 'receipt';

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

@Injectable()
export class EventPurchasesService {
  constructor(
    @InjectRepository(EventPurchase)
    private readonly purchaseRepo: Repository<EventPurchase>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(EventTicketType)
    private readonly ticketTypeRepo: Repository<EventTicketType>,
    private readonly storage: DiskStorageService,
  ) {}

  async list(
    filters: GetEventPurchasesDto,
  ): Promise<EventPurchasesListResponse> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;

    const qb = this.purchaseRepo.createQueryBuilder('p');
    this.applyFilters(qb, filters);

    const totalsRaw = await qb
      .clone()
      .select('count(*)', 'totalPurchases')
      .addSelect(`count(*) FILTER (WHERE p.status = 'PAID')`, 'paidPurchases')
      .addSelect(
        `coalesce(sum(p.total) FILTER (WHERE p.status = 'PAID'), 0)`,
        'paidAmount',
      )
      .getRawOne<{
        totalPurchases: string;
        paidPurchases: string;
        paidAmount: string;
      }>();

    const [rows, totalItems] = await qb
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const titles = await this.loadEventTitles(rows);

    return {
      items: rows.map((r) => this.toRow(r, titles.get(r.eventId) ?? null)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
      totals: {
        totalPurchases: Number(totalsRaw?.totalPurchases ?? 0),
        paidPurchases: Number(totalsRaw?.paidPurchases ?? 0),
        paidAmount: Number(totalsRaw?.paidAmount ?? 0),
      },
    };
  }

  async getDetail(id: string): Promise<EventPurchaseDetail> {
    const purchase = await this.purchaseRepo.findOne({ where: { id } });
    if (!purchase) {
      throw new NotFoundException('Compra no encontrada');
    }

    // La condicion de pagador se arma en JS: un parametro nulo usado en
    // "IS NOT NULL" hace que Postgres no pueda inferir su tipo.
    const hasPayer = !!purchase.mpPayerId;
    const otherParams: Record<string, string> = {
      id: purchase.id,
      email: purchase.buyerEmail,
    };
    if (hasPayer) otherParams.payerId = purchase.mpPayerId as string;
    const otherWhere =
      'p.id <> :id AND (lower(p."buyerEmail") = lower(:email)' +
      (hasPayer ? ' OR p."mpPayerId" = :payerId)' : ')');

    const [ticketTypes, others] = await Promise.all([
      this.ticketTypeRepo.find({ where: { eventId: purchase.eventId } }),
      this.purchaseRepo
        .createQueryBuilder('p')
        .where(otherWhere)
        .setParameters(otherParams)
        .orderBy('p.createdAt', 'DESC')
        .getMany(),
    ]);

    const typeNames = new Map(ticketTypes.map((t) => [t.id, t.name]));
    const titles = await this.loadEventTitles([purchase, ...others]);

    return {
      ...this.toRow(purchase, titles.get(purchase.eventId) ?? null),
      mpPayerId: purchase.mpPayerId ?? null,
      paidAt: purchase.paidAt ? purchase.paidAt.toISOString() : null,
      mpPaymentMethod: purchase.mpPaymentMethod ?? null,
      attendees: (purchase.itemsSnapshot ?? []).map((it) => ({
        firstName: it.attendeeFirstName,
        lastName: it.attendeeLastName,
        ticketTypeName: typeNames.get(it.ticketTypeId) ?? null,
        attendanceDate: it.attendanceDate ?? null,
        sessionId: it.sessionId ?? null,
      })),
      hasTicketsFile: !!purchase.ticketsFileKey,
      hasReceiptFile: !!purchase.receiptFileKey,
      otherPurchases: others.map((o) =>
        this.toRow(o, titles.get(o.eventId) ?? null),
      ),
    };
  }

  async getFile(
    id: string,
    kind: EventPurchaseFileKind,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const purchase = await this.purchaseRepo.findOne({ where: { id } });
    if (!purchase) {
      throw new NotFoundException('Compra no encontrada');
    }
    const key =
      kind === 'tickets' ? purchase.ticketsFileKey : purchase.receiptFileKey;
    if (!key) {
      throw new NotFoundException('Archivo no disponible');
    }

    let buffer: Buffer;
    try {
      buffer = await this.storage.getObject(key);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e?.code === 'ENOENT' || e?.message === 'Ruta fuera de UPLOADS_DIR') {
        throw new NotFoundException('Archivo no disponible');
      }
      throw err;
    }

    const base = this.isManual(purchase.mpPaymentId)
      ? purchase.id
      : (purchase.mpPaymentId ?? purchase.id);
    const suffix = kind === 'tickets' ? 'tickets' : 'comprobante';
    return { buffer, filename: `${base}-${suffix}.pdf` };
  }

  private applyFilters(
    qb: SelectQueryBuilder<EventPurchase>,
    filters: GetEventPurchasesDto,
  ): void {
    const params: Record<string, unknown> = {};

    if (filters.status) {
      qb.andWhere('p.status = :status');
      params.status = filters.status;
    }
    if (filters.eventId) {
      qb.andWhere('p."eventId" = :eventId');
      params.eventId = filters.eventId;
    }
    if (filters.startDate) {
      qb.andWhere(`${SANTIAGO_DATE} >= :startDate`);
      params.startDate = filters.startDate;
    }
    if (filters.endDate) {
      qb.andWhere(`${SANTIAGO_DATE} <= :endDate`);
      params.endDate = filters.endDate;
    }

    const search = filters.search?.trim();
    if (search) {
      qb.andWhere(
        `(p."buyerEmail" ILIKE :q ESCAPE '\\'
          OR p."mpPayerName" ILIKE :q ESCAPE '\\'
          OR p."mpPayerId" ILIKE :q ESCAPE '\\'
          OR p."mpPaymentId" ILIKE :q ESCAPE '\\'
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(p."itemsSnapshot") it
            WHERE (it->>'attendeeFirstName') || ' ' || (it->>'attendeeLastName') ILIKE :q ESCAPE '\\'
          ))`,
      );
      params.q = `%${escapeLike(search)}%`;
    }

    if (Object.keys(params).length) {
      qb.setParameters(params);
    }
  }

  private async loadEventTitles(
    rows: EventPurchase[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.eventId))];
    if (!ids.length) return new Map();
    const events = await this.eventRepo.find({ where: { id: In(ids) } });
    return new Map(events.map((e) => [e.id, e.title]));
  }

  private isManual(mpPaymentId: string | null): boolean {
    return !!mpPaymentId && mpPaymentId.startsWith(INTERNAL_PREFIX);
  }

  private toRow(p: EventPurchase, eventTitle: string | null): EventPurchaseRow {
    const manual = this.isManual(p.mpPaymentId);
    const first = p.itemsSnapshot?.[0];
    const fromAttendee = first
      ? `${first.attendeeFirstName} ${first.attendeeLastName}`.trim()
      : '';
    return {
      id: p.id,
      createdAt: p.createdAt.toISOString(),
      buyerEmail: p.buyerEmail,
      buyerDisplayName: p.mpPayerName || fromAttendee || null,
      eventId: p.eventId,
      eventTitle,
      ticketsCount: p.itemsSnapshot?.length ?? 0,
      total: Number(p.total),
      status: p.status,
      origin: p.origin,
      mpPaymentId: manual ? null : (p.mpPaymentId ?? null),
      manualPaymentMethod: manual
        ? (p.mpPaymentId as string).slice(INTERNAL_PREFIX.length)
        : null,
    };
  }
}
