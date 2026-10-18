import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { monthInSantiago } from '../../common/date/santiago-date';
import { EventPurchase } from '../events/entities/event-purchase.entity';
import { DiskStorageService } from '../images/storage/disk-storage.service';
import type { PdfTicketInput } from '../tickets-pdf/tickets-pdf.service';
import { buildReceiptPdf } from './receipt-pdf';
import { SalePaymentInfo } from './sales-archive.types';

const PDF = 'application/pdf';

/**
 * Archivo de ventas en disco. Best-effort: ningún método lanza, un fallo de
 * archivado jamás debe afectar el pago, los tickets ni el correo.
 */
@Injectable()
export class SalesArchiveService {
  private readonly logger = new Logger(SalesArchiveService.name);

  constructor(
    @InjectRepository(EventPurchase)
    private readonly purchaseRepository: Repository<EventPurchase>,
    private readonly storage: DiskStorageService,
  ) {}

  async archivePaidSale(
    purchase: EventPurchase,
    ticketsPdf: Buffer | null,
    payment: SalePaymentInfo | null,
    eventTitle: string,
    tickets: PdfTicketInput[],
  ): Promise<void> {
    try {
      if (!purchase.mpPaymentId) {
        this.logger.warn(
          `Compra ${purchase.id} sin mpPaymentId: no se archiva`,
        );
        return;
      }

      const month = monthInSantiago(payment?.approvedAt ?? new Date());
      const base = `ventas/${month}/${purchase.mpPaymentId}`;
      const data: Partial<
        Pick<
          EventPurchase,
          | 'ticketsFileKey'
          | 'receiptFileKey'
          | 'mpPayerId'
          | 'mpPayerName'
          | 'mpPaymentMethod'
          | 'paidAt'
        >
      > = {};

      if (ticketsPdf) {
        const key = `${base}-tickets.pdf`;
        try {
          await this.storage.putObject(key, ticketsPdf, PDF);
          data.ticketsFileKey = key;
        } catch (err) {
          this.logger.error(
            `No se pudo archivar tickets de compra ${purchase.id}: ${String(err)}`,
          );
        }
      }

      if (payment) {
        const key = `${base}-comprobante.pdf`;
        try {
          const receipt = await buildReceiptPdf({
            purchaseId: purchase.id,
            buyerEmail: purchase.buyerEmail,
            eventTitle,
            payment,
            tickets,
          });
          await this.storage.putObject(key, receipt, PDF);
          data.receiptFileKey = key;
        } catch (err) {
          this.logger.error(
            `No se pudo archivar comprobante de compra ${purchase.id}: ${String(err)}`,
          );
        }
        data.mpPayerId = payment.payerId;
        data.mpPayerName = payment.payerName;
        data.mpPaymentMethod = payment.paymentMethodId;
        data.paidAt = payment.approvedAt;
      }

      if (Object.keys(data).length === 0) return;
      await this.purchaseRepository.update(purchase.id, data);
    } catch (err) {
      this.logger.error(
        `Fallo archivando venta ${purchase.id}: ${String(err)}`,
      );
    }
  }

  async archiveManualSale(
    purchase: EventPurchase,
    ticketsPdf: Buffer,
  ): Promise<void> {
    try {
      const key = `ventas/${monthInSantiago(new Date())}/${purchase.id}-tickets.pdf`;
      await this.storage.putObject(key, ticketsPdf, PDF);
      await this.purchaseRepository.update(purchase.id, {
        ticketsFileKey: key,
      });
    } catch (err) {
      this.logger.error(
        `Fallo archivando venta manual ${purchase.id}: ${String(err)}`,
      );
    }
  }
}
