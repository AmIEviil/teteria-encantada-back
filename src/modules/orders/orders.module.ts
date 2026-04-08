import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestaurantTable } from '../layouts/entities/restaurant-table.entity';
import { Product } from '../products/entities/product.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { MonthlyTableSalesSummary } from './entities/monthly-table-sales-summary.entity';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Product,
      RestaurantTable,
      Reservation,
      MonthlyTableSalesSummary,
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
