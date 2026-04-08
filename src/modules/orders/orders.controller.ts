import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetOrdersReportDto } from './dto/get-orders-report.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersReportResponse } from './dto/orders-report-response.dto';
import { Order, OrderStatus } from './entities/order.entity';
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';
import { Roles } from '../auth/decorators/roles.decorator';
import { OrdersService } from './orders.service';

@Controller('orders')
@Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.TECNICO)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() createOrderDto: CreateOrderDto): Promise<Order> {
    return this.ordersService.create(createOrderDto);
  }

  @Get()
  findAll(
    @Query('tableId') tableId?: string,
    @Query('status') status?: string,
  ): Promise<Order[]> {
    if (tableId && !isUUID(tableId)) {
      throw new BadRequestException('tableId debe ser un UUID valido');
    }

    if (status && !Object.values(OrderStatus).includes(status as OrderStatus)) {
      throw new BadRequestException('status no es valido para una orden');
    }

    return this.ordersService.findAll(
      tableId,
      status as OrderStatus | undefined,
    );
  }

  @Get('report')
  findReport(
    @Query() filters: GetOrdersReportDto,
  ): Promise<OrdersReportResponse> {
    return this.ordersService.findReport(filters);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Order> {
    return this.ordersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrderDto: UpdateOrderDto,
  ): Promise<Order> {
    return this.ordersService.update(id, updateOrderDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.ordersService.remove(id);
  }
}
