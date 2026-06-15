import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { And, In, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import {
  Reservation,
  ReservationConfirmationStatus,
  ReservationStatus,
} from '../reservations/entities/reservation.entity';
import { WhatsappService } from './whatsapp.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { noResponseCutoff, reminderUpperBound } from './utils/reminder-window';

@Injectable()
export class ReservationReminderService {
  private readonly logger = new Logger(ReservationReminderService.name);

  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    private readonly whatsappService: WhatsappService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendDueReminders(): Promise<void> {
    const now = new Date();

    const dueReservations = await this.reservationRepository.find({
      where: {
        status: ReservationStatus.ACTIVE,
        confirmationStatus: ReservationConfirmationStatus.NOT_SENT,
        reservedFor: And(
          MoreThan(now),
          LessThanOrEqual(reminderUpperBound(now)),
        ),
      },
    });

    for (const reservation of dueReservations) {
      if (!reservation.phone) {
        continue;
      }

      try {
        await this.whatsappService.sendReminderTemplate(
          reservation.phone,
          reservation.holderName ?? 'cliente',
        );
      } catch (error) {
        this.logger.error(
          `No se pudo enviar recordatorio a reserva ${reservation.id}: ${String(error)}`,
        );
        continue;
      }

      reservation.confirmationStatus = ReservationConfirmationStatus.PENDING;
      reservation.confirmationSentAt = new Date();
      await this.reservationRepository.save(reservation);

      this.realtimeGateway.emitReservationsChanged({
        tableId: reservation.tableId,
        reason: 'REMINDER_SENT',
      });
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async markNoResponses(): Promise<void> {
    const now = new Date();

    const staleReservations = await this.reservationRepository.find({
      select: { id: true, tableId: true },
      where: {
        status: ReservationStatus.ACTIVE,
        confirmationStatus: ReservationConfirmationStatus.PENDING,
        confirmationSentAt: LessThanOrEqual(noResponseCutoff(now)),
      },
    });

    if (staleReservations.length === 0) {
      return;
    }

    await this.reservationRepository.update(
      { id: In(staleReservations.map((r) => r.id)) },
      { confirmationStatus: ReservationConfirmationStatus.NO_RESPONSE },
    );

    for (const reservation of staleReservations) {
      this.realtimeGateway.emitReservationsChanged({
        tableId: reservation.tableId,
        reason: 'NO_RESPONSE',
      });
    }
  }
}
