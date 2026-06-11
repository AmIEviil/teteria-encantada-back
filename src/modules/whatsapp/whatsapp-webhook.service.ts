import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Reservation,
  ReservationConfirmationStatus,
} from '../reservations/entities/reservation.entity';
import { ReservationsService } from '../reservations/reservations.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { parseConfirmationReply } from './utils/reply-parser';

interface IncomingMessage {
  from?: string;
  type?: string;
  text?: { body?: string };
  button?: { payload?: string; text?: string };
  interactive?: {
    button_reply?: { id?: string; title?: string };
  };
}

@Injectable()
export class WhatsappWebhookService {
  private readonly logger = new Logger(WhatsappWebhookService.name);

  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    private readonly reservationsService: ReservationsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async handleIncoming(payload: unknown): Promise<void> {
    const messages = this.extractMessages(payload);

    for (const message of messages) {
      await this.processMessage(message);
    }
  }

  private extractMessages(payload: unknown): IncomingMessage[] {
    const body = payload as {
      entry?: Array<{
        changes?: Array<{ value?: { messages?: IncomingMessage[] } }>;
      }>;
    };

    const messages: IncomingMessage[] = [];
    for (const entry of body?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const message of change.value?.messages ?? []) {
          messages.push(message);
        }
      }
    }
    return messages;
  }

  private extractText(message: IncomingMessage): string {
    return (
      message.button?.payload ??
      message.interactive?.button_reply?.id ??
      message.text?.body ??
      ''
    );
  }

  private async processMessage(message: IncomingMessage): Promise<void> {
    const phone = message.from;
    if (!phone) {
      return;
    }

    const decision = parseConfirmationReply(this.extractText(message));
    if (decision === 'UNKNOWN') {
      this.logger.log(`Respuesta no interpretable de ${phone}; se ignora.`);
      return;
    }

    const reservation = await this.findPendingReservationByPhone(phone);
    if (!reservation) {
      this.logger.log(`Sin reserva PENDING para ${phone}; se ignora.`);
      return;
    }

    const { tableId } = await this.reservationsService.applyConfirmationDecision(
      reservation.id,
      decision,
    );

    this.realtimeGateway.emitReservationsChanged({
      tableId,
      reason: decision === 'CONFIRM' ? 'CONFIRMED' : 'DECLINED',
    });
  }

  private async findPendingReservationByPhone(
    phone: string,
  ): Promise<Reservation | null> {
    const variants = this.phoneVariants(phone);
    return this.reservationRepository.findOne({
      where: variants.map((value) => ({
        phone: value,
        confirmationStatus: ReservationConfirmationStatus.PENDING,
      })),
      order: { reservedFor: 'ASC' },
    });
  }

  private phoneVariants(phone: string): string[] {
    const digits = phone.replace(/[^0-9]/g, '');
    return Array.from(new Set([phone, digits, `+${digits}`]));
  }
}
