import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestaurantTable } from '../layouts/entities/restaurant-table.entity';
import { Product } from '../products/entities/product.entity';
import { ReservationsModule } from '../reservations/reservations.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, RestaurantTable]),
    ReservationsModule,
  ],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
