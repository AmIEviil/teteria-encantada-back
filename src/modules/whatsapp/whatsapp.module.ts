import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reservation } from '../reservations/entities/reservation.entity';
import { ReservationsModule } from '../reservations/reservations.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWebhookService } from './whatsapp-webhook.service';
import { ReservationReminderService } from './reservation-reminder.service';
import { WhatsappController } from './whatsapp.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reservation]),
    ReservationsModule,
    RealtimeModule,
  ],
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    WhatsappWebhookService,
    ReservationReminderService,
  ],
})
export class WhatsappModule {}
