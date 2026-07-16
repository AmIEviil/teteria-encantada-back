import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventTicketTypeDailyStock } from './entities/event-ticket-type-daily-stock.entity';
import { EventTicketType } from './entities/event-ticket-type.entity';
import { EventTicket } from './entities/event-ticket.entity';
import { Event } from './entities/event.entity';
import { EventSession } from './entities/event-session.entity';
import { EventSessionTicketAllocation } from './entities/event-session-ticket-allocation.entity';
import { EventPurchase } from './entities/event-purchase.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { LoyaltyModule } from '../loyalty/loyalty.module';

import { MailerModule } from '../mailer/mailer.module';
import { TicketsPdfModule } from '../tickets-pdf/tickets-pdf.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Event,
      EventTicketType,
      EventTicketTypeDailyStock,
      EventTicket,
      EventSession,
      EventSessionTicketAllocation,
      EventPurchase,
    ]),
    LoyaltyModule,
    MailerModule,
    TicketsPdfModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
