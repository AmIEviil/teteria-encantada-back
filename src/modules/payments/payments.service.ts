import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EventPurchase,
  EventPurchaseItemSnapshot,
  EventPurchaseStatus,
} from '../events/entities/event-purchase.entity';
import {
  EventsService,
  PublicPurchaseItemInput,
  PublicPurchaseQuoteLine,
  PublicPurchaseResult,
} from '../events/events.service';
import { MailerService } from '../mailer/mailer.service';
import {
  TicketsPdfService,
  PdfTicketInput,
} from '../tickets-pdf/tickets-pdf.service';
import { MercadoPagoService, MpItem } from './mercadopago.service';

export interface PayEventInput {
  buyerEmail: string;
  items: PublicPurchaseItemInput[];
  payment: {
    token: string;
    installments: number;
    paymentMethodId: string;
    issuerId?: string;
  };
}

export interface PayEventResult {
  status: 'approved' | 'pending' | 'rejected';
  statusDetail: string;
  purchase: PublicPurchaseResult | null;
}

type PaymentOutcome = 'approved' | 'pending' | 'rejected';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  // Hasta acá, una línea por ticket en el detalle de MP. Más que esto, se
  // agrupa por tipo y los asistentes se mueven a la description de cada línea.
  private static readonly MAX_UNGROUPED_MP_ITEMS = 10;

  constructor(
    @InjectRepository(EventPurchase)
    private readonly purchaseRepository: Repository<EventPurchase>,
    private readonly eventsService: EventsService,
    private readonly mercadoPago: MercadoPagoService,
    private readonly mailer: MailerService,
    private readonly ticketsPdf: TicketsPdfService,
  ) {}

  async pay(eventId: string, input: PayEventInput): Promise<PayEventResult> {
    const quote = await this.eventsService.quotePublicPurchaseDetailed(
      eventId,
      input.items,
    );
    const total = quote.total;

    const purchase = await this.purchaseRepository.save(
      this.purchaseRepository.create({
        eventId,
        buyerEmail: input.buyerEmail,
        itemsSnapshot: input.items.map((i) => this.toSnapshot(i)),
        total,
        status: EventPurchaseStatus.PENDING,
      }),
    );

    const charge = await this.mercadoPago.charge({
      amount: total,
      token: input.payment.token,
      installments: input.payment.installments,
      paymentMethodId: input.payment.paymentMethodId,
      issuerId: input.payment.issuerId,
      payerEmail: input.buyerEmail,
      description: this.buildChargeDescription(
        quote.eventTitle,
        quote.lines,
        purchase.itemsSnapshot,
      ),
      items: this.buildMpItems(quote.lines, purchase.itemsSnapshot),
      externalReference: purchase.id,
      // Requerido por MP para no duplicar el cobro si esta llamada se
      // reintenta (timeout de red, etc.): mismo externalReference no
      // dedupea en la API de MP, la idempotency key sí.
      idempotencyKey: purchase.id,
    });

    await this.purchaseRepository.update(purchase.id, {
      mpPaymentId: charge.id,
    });

    const outcome = this.classifyOutcome(charge.status);

    if (outcome === 'approved') {
      const result = await this.fulfill(purchase.id);
      return {
        status: 'approved',
        statusDetail: charge.statusDetail,
        purchase: result,
      };
    }

    if (outcome === 'pending') {
      return {
        status: 'pending',
        statusDetail: charge.statusDetail,
        purchase: null,
      };
    }

    // rejected (incluye cualquier estado no reconocido, p.ej. 'unknown').
    // Update condicional: si un webhook ya marcó PAID/REJECTED esta compra,
    // no la pisamos.
    await this.purchaseRepository.update(
      { id: purchase.id, status: EventPurchaseStatus.PENDING },
      { status: EventPurchaseStatus.REJECTED },
    );
    return {
      status: 'rejected',
      statusDetail: charge.statusDetail,
      purchase: null,
    };
  }

  async handleWebhook(paymentId: string): Promise<void> {
    const payment = await this.mercadoPago.getPayment(paymentId);
    if (!payment.externalReference) return;

    const outcome = this.classifyOutcome(payment.status);

    if (outcome === 'approved') {
      await this.fulfill(payment.externalReference);
      return;
    }

    // No-approved (rejected/pending/in_process/cualquier otro): el webhook
    // NUNCA rechaza terminalmente. A diferencia del cobro inline en pay(),
    // que es una respuesta síncrona y definitiva, un webhook puede llegar
    // con un status intermedio (p.ej. 'in_mediation') antes de uno
    // 'approved' posterior para el mismo pago. Si aquí escribiéramos
    // REJECTED, dejaríamos la fila en un estado terminal y bloquearíamos
    // para siempre el fulfill del webhook 'approved' que llegue después.
    // Se deja la fila PENDING y no se hace nada: se espera el próximo webhook.
  }

  // Mapea el status crudo de MP a un resultado de 3 vías. Cualquier valor no
  // reconocido (incluido el sentinel 'unknown' de MercadoPagoService cuando
  // la respuesta no trae status) se trata como rechazado: nunca se fulfilla
  // sobre un estado que no podemos confirmar como aprobado.
  private classifyOutcome(status: string): PaymentOutcome {
    if (status === 'approved') return 'approved';
    if (status === 'in_process' || status === 'pending') return 'pending';
    return 'rejected';
  }

  // Guard de idempotencia real: update condicional que sólo afecta la fila
  // si sigue PENDING. Si dos llamadas (pay() inline + webhook, o dos
  // webhooks) corren en paralelo, sólo una gana la carrera (affected === 1);
  // la otra ve affected === 0 y no hace nada, evitando tickets/correos
  // duplicados.
  private async fulfill(
    purchaseId: string,
  ): Promise<PublicPurchaseResult | null> {
    const purchase = await this.purchaseRepository.findOne({
      where: { id: purchaseId },
    });
    if (!purchase) return null;

    const claim = await this.purchaseRepository.update(
      { id: purchaseId, status: EventPurchaseStatus.PENDING },
      { status: EventPurchaseStatus.PAID },
    );

    if (claim.affected !== 1) {
      // Otro proceso ya reclamó (o la compra no estaba PENDING). No hacemos
      // nada: ni tickets ni correo.
      return null;
    }

    let result: PublicPurchaseResult;
    try {
      // purchaseId: se pasa a createPublicTickets para que cada ticket se
      // persista YA enlazado a la compra (no una UPDATE separada después):
      // si esa UPDATE separada fallara, los tickets quedarían committeados
      // huérfanos (purchaseId null) y un reintento del webhook los
      // duplicaría. allowOversell: el cobro ya fue capturado por MP en este
      // punto, así que la entrega de tickets no puede fallar por falta de
      // stock (decisión de producto: se acepta el oversell raro aquí).
      result = await this.eventsService.createPublicTickets(purchase.eventId, {
        buyerEmail: purchase.buyerEmail,
        items: purchase.itemsSnapshot.map((s) => this.fromSnapshot(s)),
        purchaseId,
        allowOversell: true,
      });
    } catch (err) {
      // Ya reclamamos la fila (PAID) pero la creación de tickets falló: si
      // dejáramos la fila en PAID quedaría cobrada y sin tickets para
      // siempre (el próximo webhook vería affected === 0 y no reintentaría
      // nada). Revertimos a PENDING para que un webhook 'approved'
      // posterior pueda reclamarla de nuevo y reintentar.
      await this.purchaseRepository.update(
        { id: purchaseId },
        { status: EventPurchaseStatus.PENDING },
      );
      throw err;
    }

    await this.sendTicketsEmail(purchase, result);
    return result;
  }

  private async sendTicketsEmail(
    purchase: EventPurchase,
    result: PublicPurchaseResult,
  ): Promise<void> {
    try {
      // Una sola consulta del evento (no una por ticket): evita N+1 y evita
      // el riesgo de resolver la plantilla por nombre de tipo (los nombres
      // de tipo de ticket no son únicos por evento). Se resuelve por el
      // ticketTypeId guardado en el snapshot de la compra, emparejando por
      // índice con result.tickets (createPublicTickets preserva el orden
      // de items de entrada al crear y al mapear el resultado).
      const event = await this.eventsService.findOne(purchase.eventId);
      const templateUrlByTicketTypeId = new Map(
        (event.ticketTypes ?? []).map((tt) => [
          tt.id,
          tt.customTicketTemplateUrl ?? null,
        ]),
      );

      const sessionTimeById = new Map(
        (event.sessions ?? []).map((s) => [s.id, s.startTime.slice(0, 5)]),
      );
      const sessionNameById = new Map(
        (event.sessions ?? []).map((s) => [s.id, s.name]),
      );
      const seqByTicketId = await this.eventsService.getTicketSequences(
        purchase.eventId,
      );

      const pdfInputs: PdfTicketInput[] = result.tickets.map((t, index) => {
        const snapshotItem = purchase.itemsSnapshot[index];
        const customTemplateUrl = snapshotItem
          ? (templateUrlByTicketTypeId.get(snapshotItem.ticketTypeId) ?? null)
          : null;
        const sessionTime = t.sessionId
          ? (sessionTimeById.get(t.sessionId) ?? null)
          : null;
        const sessionName = t.sessionId
          ? (sessionNameById.get(t.sessionId) ?? null)
          : null;

        return {
          eventTitle: result.eventTitle,
          ticketTypeName: t.ticketTypeName,
          spectacleType: sessionName || 'EVENTO',
          attendeeName: `${t.attendeeFirstName} ${t.attendeeLastName}`,
          attendanceDate: t.attendanceDate,
          sessionTime,
          menuSummary: t.menuSummary,
          ticketNumber: this.buildTicketNumber(
            t.attendanceDate,
            sessionTime,
            seqByTicketId.get(t.id) ?? index + 1,
            event.startsAt,
          ),
          customTemplateUrl,
          price: t.price,
        };
      });

      const pdf = await this.ticketsPdf.buildTicketsPdf(pdfInputs);
      await this.mailer.send({
        to: purchase.buyerEmail,
        subject: `Tus tickets — ${result.eventTitle}`,
        html: `<p>¡Gracias por tu compra! Adjuntamos ${result.tickets.length} ticket(s) para <b>${result.eventTitle}</b>.</p>`,
        attachments: [{ filename: 'tickets.pdf', content: pdf }],
      });
    } catch (err) {
      // El cobro ya fue aprobado y los tickets ya existen: un correo caído
      // no debe hacer fallar la request ni revertir nada. Se registra y sigue.
      this.logger.error(`Fallo enviando correo de tickets: ${String(err)}`);
    }
  }

  // Descripción que ve el comercio en el panel de MP (y el comprador en el
  // resumen del pago). Ej:
  // "Tickets Coraline - 14/07/2026 - General x2, VIP x1 (3 tickets)".
  // Las fechas salen del snapshot (ya normalizadas a YYYY-MM-DD: reformatear
  // no puede desfasarse por zona horaria).
  // MP corta la descripción a 255 chars: el título y el desglose se recortan
  // antes para que fecha y cantidad total nunca se pierdan.
  private buildChargeDescription(
    eventTitle: string,
    lines: PublicPurchaseQuoteLine[],
    items: EventPurchaseItemSnapshot[],
  ): string {
    const dates = [
      ...new Set(items.map((i) => i.attendanceDate).filter((d) => !!d)),
    ].sort();

    // Varias fechas en una misma compra -> rango. Sin fechas (evento sin
    // fecha de asistencia) -> se omite el tramo.
    const datePart =
      dates.length === 0
        ? ''
        : dates.length === 1
          ? ` - ${this.formatDate(dates[0]!)}`
          : ` - ${this.formatDate(dates[0]!)} a ${this.formatDate(dates[dates.length - 1]!)}`;

    const byName = new Map<string, number>();
    for (const line of lines) {
      byName.set(
        line.ticketTypeName,
        (byName.get(line.ticketTypeName) ?? 0) + 1,
      );
    }
    const breakdown = [...byName]
      .map(([name, qty]) => `${name} x${qty}`)
      .join(', ')
      .slice(0, 80);

    const count = `${lines.length} ticket${lines.length === 1 ? '' : 's'}`;
    return `Tickets ${eventTitle.trim().slice(0, 100)}${datePart} - ${breakdown} (${count})`;
  }

  // Detalle que MP muestra dentro del pago.
  //
  // Hasta MAX_UNGROUPED_MP_ITEMS tickets: una línea por ticket (quantity 1),
  // con asistente, fecha y hora en el título. Pasado ese umbral el panel de MP
  // se vuelve una lista ilegible, así que se agrupa por tipo y los asistentes
  // se mueven a la description de cada línea.
  //
  // En ambos modos sum(quantity * unitPrice) === monto cobrado: agrupado o no,
  // se agrupa por tipo Y precio (dos tickets del mismo tipo con menús distintos
  // cuestan distinto). Si no cuadrara, MP mostraría un detalle que contradice
  // el cobro.
  //
  // lines y items van emparejados por índice: ambos derivan de input.items en
  // el mismo orden (quotePublicPurchaseDetailed y toSnapshot los recorren tal
  // cual).
  private buildMpItems(
    lines: PublicPurchaseQuoteLine[],
    items: EventPurchaseItemSnapshot[],
  ): MpItem[] {
    const detailed = lines.map((line, index) => ({
      line,
      // Ej: "Ana Pérez - 01/08/2026 10:00" (sin jornada: sólo la fecha).
      label: [
        line.attendeeName,
        this.formatWhen(items[index]?.attendanceDate ?? null, line.sessionTime),
      ]
        .filter((part) => !!part)
        .join(' - '),
    }));

    if (detailed.length <= PaymentsService.MAX_UNGROUPED_MP_ITEMS) {
      return detailed.map(({ line, label }) => ({
        id: line.ticketTypeId,
        title: this.truncate(
          [line.ticketTypeName, label].filter((p) => !!p).join(' - '),
        ),
        quantity: 1,
        unitPrice: line.unitPrice,
      }));
    }

    const groups = new Map<string, MpItem & { attendees: string[] }>();

    for (const { line, label } of detailed) {
      const key = `${line.ticketTypeId}|${line.unitPrice}`;
      const existing = groups.get(key);
      if (existing) {
        existing.quantity += 1;
        existing.attendees.push(label);
        continue;
      }
      groups.set(key, {
        id: line.ticketTypeId,
        title: line.ticketTypeName,
        quantity: 1,
        unitPrice: line.unitPrice,
        attendees: [label],
      });
    }

    return [...groups.values()].map(({ attendees, ...item }) => ({
      ...item,
      title: this.truncate(item.title),
      description: this.truncate(attendees.join(', ')),
    }));
  }

  // Ej: "01/08/2026 10:00". Sin jornada: "01/08/2026". Sin fecha: "".
  private formatWhen(
    attendanceDate: string | null,
    sessionTime: string | null,
  ): string {
    return [
      attendanceDate ? this.formatDate(attendanceDate) : null,
      sessionTime,
    ]
      .filter((part) => !!part)
      .join(' ');
  }

  // MP corta title y description de cada item a 256 chars: cortamos antes y
  // marcamos el corte, para no mandar un nombre partido a la mitad como si
  // fuera el nombre completo.
  private truncate(text: string): string {
    return text.length <= 256 ? text : `${text.slice(0, 255)}…`;
  }

  private formatDate(iso: string): string {
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
  }

  // "#" + día + mes + hora de la jornada + correlativo del ticket en esa
  // jornada. Ej: 17 de julio, jornada de las 10:00, primer ticket -> #17071001.
  // Sin jornada (evento sin sesiones) la hora va en "00".
  private buildTicketNumber(
    attendanceDate: string,
    sessionTime: string | null,
    seq: number,
    eventStartsAt: Date,
  ): string {
    const [, month, day] = attendanceDate.split('-');
    const hour = sessionTime ? sessionTime.slice(0, 2) : String(eventStartsAt.getHours()).padStart(2, '0');
    return `#${day}${month}${hour}${String(seq).padStart(2, '0')}`;
  }

  private toSnapshot(i: PublicPurchaseItemInput): EventPurchaseItemSnapshot {
    return {
      ticketTypeId: i.ticketTypeId,
      sessionId: i.sessionId ?? null,
      attendanceDate: i.attendanceDate
        ? new Date(i.attendanceDate).toISOString().slice(0, 10)
        : null,
      attendeeFirstName: i.attendeeFirstName,
      attendeeLastName: i.attendeeLastName,
      menuSelection:
        (i.menuSelection as Record<string, unknown> | undefined) ?? null,
    };
  }

  private fromSnapshot(s: EventPurchaseItemSnapshot): PublicPurchaseItemInput {
    return {
      ticketTypeId: s.ticketTypeId,
      sessionId: s.sessionId ?? undefined,
      attendanceDate: s.attendanceDate ? new Date(s.attendanceDate) : undefined,
      attendeeFirstName: s.attendeeFirstName,
      attendeeLastName: s.attendeeLastName,
      menuSelection:
        s.menuSelection as unknown as PublicPurchaseItemInput['menuSelection'],
    };
  }
}
