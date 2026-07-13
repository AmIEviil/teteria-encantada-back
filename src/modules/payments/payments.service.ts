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
  PublicPurchaseResult,
} from '../events/events.service';
import { MailerService } from '../mailer/mailer.service';
import { TicketsPdfService, PdfTicketInput } from '../tickets-pdf/tickets-pdf.service';
import { MercadoPagoService } from './mercadopago.service';

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

  constructor(
    @InjectRepository(EventPurchase)
    private readonly purchaseRepository: Repository<EventPurchase>,
    private readonly eventsService: EventsService,
    private readonly mercadoPago: MercadoPagoService,
    private readonly mailer: MailerService,
    private readonly ticketsPdf: TicketsPdfService,
  ) {}

  async pay(eventId: string, input: PayEventInput): Promise<PayEventResult> {
    const total = await this.eventsService.quotePublicPurchase(
      eventId,
      input.items,
    );

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
      description: `Tickets evento ${eventId}`,
      externalReference: purchase.id,
      // Requerido por MP para no duplicar el cobro si esta llamada se
      // reintenta (timeout de red, etc.): mismo externalReference no
      // dedupea en la API de MP, la idempotency key sí.
      idempotencyKey: purchase.id,
    });

    await this.purchaseRepository.update(purchase.id, { mpPaymentId: charge.id });

    const outcome = this.classifyOutcome(charge.status);

    if (outcome === 'approved') {
      const result = await this.fulfill(purchase.id);
      return { status: 'approved', statusDetail: charge.statusDetail, purchase: result };
    }

    if (outcome === 'pending') {
      return { status: 'pending', statusDetail: charge.statusDetail, purchase: null };
    }

    // rejected (incluye cualquier estado no reconocido, p.ej. 'unknown').
    // Update condicional: si un webhook ya marcó PAID/REJECTED esta compra,
    // no la pisamos.
    await this.purchaseRepository.update(
      { id: purchase.id, status: EventPurchaseStatus.PENDING },
      { status: EventPurchaseStatus.REJECTED },
    );
    return { status: 'rejected', statusDetail: charge.statusDetail, purchase: null };
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
  private async fulfill(purchaseId: string): Promise<PublicPurchaseResult | null> {
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

      const pdfInputs: PdfTicketInput[] = result.tickets.map((t, index) => {
        const snapshotItem = purchase.itemsSnapshot[index];
        const customTemplateUrl = snapshotItem
          ? (templateUrlByTicketTypeId.get(snapshotItem.ticketTypeId) ?? null)
          : null;

        return {
          eventTitle: result.eventTitle,
          ticketTypeName: t.ticketTypeName,
          attendeeName: `${t.attendeeFirstName} ${t.attendeeLastName}`,
          attendanceDate: t.attendanceDate,
          sessionTime: null,
          customTemplateUrl,
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

  private toSnapshot(i: PublicPurchaseItemInput): EventPurchaseItemSnapshot {
    return {
      ticketTypeId: i.ticketTypeId,
      sessionId: i.sessionId ?? null,
      attendanceDate: i.attendanceDate
        ? new Date(i.attendanceDate).toISOString().slice(0, 10)
        : null,
      attendeeFirstName: i.attendeeFirstName,
      attendeeLastName: i.attendeeLastName,
      menuSelection: (i.menuSelection as Record<string, unknown> | undefined) ?? null,
    };
  }

  private fromSnapshot(s: EventPurchaseItemSnapshot): PublicPurchaseItemInput {
    return {
      ticketTypeId: s.ticketTypeId,
      sessionId: s.sessionId ?? undefined,
      attendanceDate: s.attendanceDate ? new Date(s.attendanceDate) : undefined,
      attendeeFirstName: s.attendeeFirstName,
      attendeeLastName: s.attendeeLastName,
      menuSelection: s.menuSelection as unknown as PublicPurchaseItemInput['menuSelection'],
    };
  }
}
