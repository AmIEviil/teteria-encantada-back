import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateLayoutDto } from './dto/create-layout.dto';
import { SaveLayoutSnapshotDto } from './dto/save-layout-snapshot.dto';
import { UpdateLayoutDto } from './dto/update-layout.dto';
import { TableLayout } from './entities/table-layout.entity';
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';
import { Roles } from '../auth/decorators/roles.decorator';
import { LayoutsService } from './layouts.service';

@Controller('layouts')
@Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.TECNICO)
export class LayoutsController {
  constructor(private readonly layoutsService: LayoutsService) {}

  @Post()
  createLayout(@Body() createLayoutDto: CreateLayoutDto): Promise<TableLayout> {
    return this.layoutsService.createLayout(createLayoutDto);
  }

  @Post('snapshot')
  createLayoutSnapshot(
    @Body() saveLayoutSnapshotDto: SaveLayoutSnapshotDto,
  ): Promise<TableLayout> {
    return this.layoutsService.createLayoutSnapshot(saveLayoutSnapshotDto);
  }

  @Get()
  findAllLayouts(): Promise<TableLayout[]> {
    return this.layoutsService.findAllLayouts();
  }

  @Get(':id')
  findLayoutById(@Param('id', ParseUUIDPipe) id: string): Promise<TableLayout> {
    return this.layoutsService.findLayoutById(id);
  }

  @Patch(':id')
  updateLayout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateLayoutDto: UpdateLayoutDto,
  ): Promise<TableLayout> {
    return this.layoutsService.updateLayout(id, updateLayoutDto);
  }

  @Patch(':id/snapshot')
  updateLayoutSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() saveLayoutSnapshotDto: SaveLayoutSnapshotDto,
  ): Promise<TableLayout> {
    return this.layoutsService.updateLayoutSnapshot(id, saveLayoutSnapshotDto);
  }

  @Delete(':id')
  removeLayout(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return this.layoutsService.removeLayout(id);
  }
}
