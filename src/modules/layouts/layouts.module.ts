import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LayoutsController } from './layouts.controller';
import { LayoutsService } from './layouts.service';
import { RestaurantTable } from './entities/restaurant-table.entity';
import { TableLayout } from './entities/table-layout.entity';
import { TablesController } from './tables.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TableLayout, RestaurantTable])],
  controllers: [LayoutsController, TablesController],
  providers: [LayoutsService],
  exports: [LayoutsService],
})
export class LayoutsModule {}
