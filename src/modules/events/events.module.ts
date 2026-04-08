import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventTicketTypeDailyStock } from './entities/event-ticket-type-daily-stock.entity';
import { EventTicketType } from './entities/event-ticket-type.entity';
import { EventTicket } from './entities/event-ticket.entity';
import { Event } from './entities/event.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Event,
      EventTicketType,
      EventTicketTypeDailyStock,
      EventTicket,
    ]),
  ],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
