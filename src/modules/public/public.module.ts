import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../events/entities/event.entity';
import { EventsModule } from '../events/events.module';
import { RestaurantTable } from '../layouts/entities/restaurant-table.entity';
import { Product } from '../products/entities/product.entity';
import { ReservationsModule } from '../reservations/reservations.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, RestaurantTable, Event]),
    ReservationsModule,
    EventsModule,
  ],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
