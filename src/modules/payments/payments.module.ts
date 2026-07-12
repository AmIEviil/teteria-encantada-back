import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventPurchase } from '../events/entities/event-purchase.entity';
import { EventTicket } from '../events/entities/event-ticket.entity';
import { EventsModule } from '../events/events.module';
import { MailerModule } from '../mailer/mailer.module';
import { TicketsPdfModule } from '../tickets-pdf/tickets-pdf.module';
import { MercadoPagoService } from './mercadopago.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventPurchase, EventTicket]),
    EventsModule,
    MailerModule,
    TicketsPdfModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, MercadoPagoService],
})
export class PaymentsModule {}
