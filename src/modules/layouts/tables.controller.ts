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
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { RestaurantTable } from './entities/restaurant-table.entity';
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';
import { Roles } from '../auth/decorators/roles.decorator';
import { LayoutsService } from './layouts.service';

@Controller('tables')
@Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.TECNICO)
export class TablesController {
  constructor(private readonly layoutsService: LayoutsService) {}

  @Post()
  createTable(
    @Body() createTableDto: CreateTableDto,
  ): Promise<RestaurantTable> {
    return this.layoutsService.createTable(createTableDto);
  }

  @Get()
  findAllTables(
    @Query('layoutId') layoutId?: string,
  ): Promise<RestaurantTable[]> {
    if (layoutId && !isUUID(layoutId)) {
      throw new BadRequestException('layoutId debe ser un UUID valido');
    }

    return this.layoutsService.findAllTables(layoutId);
  }

  @Get(':id')
  findTableById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RestaurantTable> {
    return this.layoutsService.findTableById(id);
  }

  @Patch(':id')
  updateTable(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTableDto: UpdateTableDto,
  ): Promise<RestaurantTable> {
    return this.layoutsService.updateTable(id, updateTableDto);
  }

  @Delete(':id')
  removeTable(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return this.layoutsService.removeTable(id);
  }
}
