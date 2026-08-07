import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventPurchase } from '../events/entities/event-purchase.entity';
import { EventsModule } from '../events/events.module';
import { MailerModule } from '../mailer/mailer.module';
import { TicketsPdfModule } from '../tickets-pdf/tickets-pdf.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MercadoPagoService } from './mercadopago.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { QrCheckoutController } from './qr-checkout.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventPurchase]),
    EventsModule,
    MailerModule,
    TicketsPdfModule,
    RealtimeModule,
  ],
  controllers: [PaymentsController, QrCheckoutController],
  providers: [PaymentsService, MercadoPagoService],
})
export class PaymentsModule {}
