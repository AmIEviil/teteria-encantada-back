import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestaurantTable } from '../layouts/entities/restaurant-table.entity';
import { Order } from '../orders/entities/order.entity';
import { Reservation } from './entities/reservation.entity';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Reservation, RestaurantTable, Order])],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
