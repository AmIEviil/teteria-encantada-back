import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventPurchase } from '../events/entities/event-purchase.entity';
import { Event } from '../events/entities/event.entity';
import { EventTicketType } from '../events/entities/event-ticket-type.entity';
import { ImagesModule } from '../images/images.module';
import { EventPurchasesController } from './event-purchases.controller';
import { EventPurchasesService } from './event-purchases.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventPurchase, Event, EventTicketType]),
    ImagesModule,
  ],
  controllers: [EventPurchasesController],
  providers: [EventPurchasesService],
})
export class EventPurchasesModule {}
