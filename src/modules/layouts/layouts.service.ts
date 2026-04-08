import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateLayoutDto } from './dto/create-layout.dto';
import {
  SaveLayoutSnapshotDto,
  SaveLayoutTableDto,
} from './dto/save-layout-snapshot.dto';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateLayoutDto } from './dto/update-layout.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import {
  RestaurantTable,
  TableStatus,
} from './entities/restaurant-table.entity';
import { TableLayout } from './entities/table-layout.entity';

@Injectable()
export class LayoutsService {
  constructor(
    @InjectRepository(TableLayout)
    private readonly layoutRepository: Repository<TableLayout>,
    @InjectRepository(RestaurantTable)
    private readonly tableRepository: Repository<RestaurantTable>,
  ) {}

  async createLayout(createLayoutDto: CreateLayoutDto): Promise<TableLayout> {
    const layout = this.layoutRepository.create({
      ...createLayoutDto,
      description: createLayoutDto.description ?? null,
      isActive: createLayoutDto.isActive ?? true,
    });

    return this.layoutRepository.save(layout);
  }

  async createLayoutSnapshot(
    saveLayoutSnapshotDto: SaveLayoutSnapshotDto,
  ): Promise<TableLayout> {
    try {
      return await this.layoutRepository.manager.transaction(
        async (manager) => {
          const layoutRepository = manager.getRepository(TableLayout);
          const tableRepository = manager.getRepository(RestaurantTable);

          const layout = layoutRepository.create({
            name: saveLayoutSnapshotDto.name,
            isActive: saveLayoutSnapshotDto.isActive ?? true,
            description: this.serializeLayoutMetadata(saveLayoutSnapshotDto),
          });

          const savedLayout = await layoutRepository.save(layout);

          await this.syncLayoutTables(
            savedLayout.id,
            saveLayoutSnapshotDto.tables,
            tableRepository,
          );

          const persistedLayout = await layoutRepository.findOne({
            where: { id: savedLayout.id },
            relations: { tables: true },
            order: { tables: { createdAt: 'ASC' } },
          });

          if (!persistedLayout) {
            throw new NotFoundException(
              `Layout con id ${savedLayout.id} no encontrado`,
            );
          }

          return persistedLayout;
        },
      );
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  findAllLayouts(): Promise<TableLayout[]> {
    return this.layoutRepository.find({
      relations: { tables: true },
      order: { createdAt: 'DESC', tables: { createdAt: 'ASC' } },
    });
  }

  async findLayoutById(id: string): Promise<TableLayout> {
    const layout = await this.layoutRepository.findOne({
      where: { id },
      relations: { tables: true },
      order: { tables: { createdAt: 'ASC' } },
    });

    if (!layout) {
      throw new NotFoundException(`Layout con id ${id} no encontrado`);
    }

    return layout;
  }

  async updateLayout(
    id: string,
    updateLayoutDto: UpdateLayoutDto,
  ): Promise<TableLayout> {
    const layout = await this.findLayoutById(id);

    Object.assign(layout, {
      ...updateLayoutDto,
      description: updateLayoutDto.description ?? layout.description,
    });

    return this.layoutRepository.save(layout);
  }

  async updateLayoutSnapshot(
    id: string,
    saveLayoutSnapshotDto: SaveLayoutSnapshotDto,
  ): Promise<TableLayout> {
    try {
      return await this.layoutRepository.manager.transaction(
        async (manager) => {
          const layoutRepository = manager.getRepository(TableLayout);
          const tableRepository = manager.getRepository(RestaurantTable);

          const layout = await layoutRepository.findOne({
            where: { id },
            relations: { tables: true },
            order: { tables: { createdAt: 'ASC' } },
          });

          if (!layout) {
            throw new NotFoundException(`Layout con id ${id} no encontrado`);
          }

          Object.assign(layout, {
            name: saveLayoutSnapshotDto.name,
            isActive: saveLayoutSnapshotDto.isActive ?? layout.isActive,
            description: this.serializeLayoutMetadata(saveLayoutSnapshotDto),
          });

          await layoutRepository.save(layout);

          await this.syncLayoutTables(
            id,
            saveLayoutSnapshotDto.tables,
            tableRepository,
            layout.tables,
          );

          const persistedLayout = await layoutRepository.findOne({
            where: { id },
            relations: { tables: true },
            order: { tables: { createdAt: 'ASC' } },
          });

          if (!persistedLayout) {
            throw new NotFoundException(`Layout con id ${id} no encontrado`);
          }

          return persistedLayout;
        },
      );
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async removeLayout(id: string): Promise<{ message: string }> {
    const layout = await this.findLayoutById(id);
    await this.layoutRepository.remove(layout);

    return { message: 'Layout eliminado correctamente' };
  }

  async createTable(createTableDto: CreateTableDto): Promise<RestaurantTable> {
    await this.findLayoutById(createTableDto.layoutId);

    const table = this.tableRepository.create({
      ...createTableDto,
      label: createTableDto.label ?? null,
      capacity: createTableDto.capacity ?? 4,
      width: createTableDto.width ?? 110,
      height: createTableDto.height ?? 110,
      rotation: createTableDto.rotation ?? 0,
    });

    try {
      return await this.tableRepository.save(table);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  findAllTables(layoutId?: string): Promise<RestaurantTable[]> {
    return this.tableRepository.find({
      where: layoutId ? { layoutId } : {},
      relations: { layout: true },
      order: { createdAt: 'ASC' },
    });
  }

  async findTableById(id: string): Promise<RestaurantTable> {
    const table = await this.tableRepository.findOne({
      where: { id },
      relations: { layout: true },
    });

    if (!table) {
      throw new NotFoundException(`Mesa con id ${id} no encontrada`);
    }

    return table;
  }

  async updateTable(
    id: string,
    updateTableDto: UpdateTableDto,
  ): Promise<RestaurantTable> {
    const table = await this.findTableById(id);

    if (updateTableDto.layoutId) {
      await this.findLayoutById(updateTableDto.layoutId);
    }

    Object.assign(table, {
      ...updateTableDto,
      label: updateTableDto.label ?? table.label,
    });

    try {
      return await this.tableRepository.save(table);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async removeTable(id: string): Promise<{ message: string }> {
    const table = await this.findTableById(id);

    try {
      await this.tableRepository.remove(table);
      return { message: 'Mesa eliminada correctamente' };
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  private serializeLayoutMetadata(
    saveLayoutSnapshotDto: SaveLayoutSnapshotDto,
  ): string {
    return JSON.stringify({
      version: 1,
      gridSize: {
        rows: saveLayoutSnapshotDto.gridSize.rows,
        cols: saveLayoutSnapshotDto.gridSize.cols,
      },
      chairs: (saveLayoutSnapshotDto.chairs ?? []).map((chair) => ({
        id: chair.id,
        position: {
          x: chair.position.x,
          y: chair.position.y,
        },
        rotation: chair.rotation ?? 0,
      })),
    });
  }

  private async syncLayoutTables(
    layoutId: string,
    incomingTables: SaveLayoutTableDto[],
    tableRepository: Repository<RestaurantTable>,
    existingTablesInput?: RestaurantTable[],
  ): Promise<void> {
    const existingTables =
      existingTablesInput ??
      (await tableRepository.find({
        where: { layoutId },
      }));

    const existingTablesById = new Map(
      existingTables.map((table) => [table.id, table]),
    );
    const existingTablesByCode = new Map(
      existingTables.map((table) => [table.code, table]),
    );
    const seenIncomingCodes = new Set<string>();
    const keptTableIds = new Set<string>();
    const tablesToUpdate: Array<{
      existingTable: RestaurantTable;
      incomingTable: SaveLayoutTableDto;
    }> = [];

    for (const incomingTable of incomingTables) {
      this.assertIncomingCodeNotDuplicated(
        incomingTable.code,
        seenIncomingCodes,
      );

      const { existingTable, hasUuidId, incomingId } =
        this.resolveSnapshotTableReference(
          incomingTable,
          existingTablesById,
          existingTablesByCode,
        );

      if (existingTable) {
        if (keptTableIds.has(existingTable.id)) {
          throw new BadRequestException(
            `Mesa con id ${existingTable.id} duplicada en el payload`,
          );
        }

        keptTableIds.add(existingTable.id);
        tablesToUpdate.push({ existingTable, incomingTable });
        continue;
      }

      if (hasUuidId) {
        throw new NotFoundException(
          `Mesa con id ${incomingId} no encontrada en el layout ${layoutId}`,
        );
      }

      const newTable = tableRepository.create(
        this.buildTableSnapshotPayload(layoutId, incomingTable),
      );
      const savedTable = await tableRepository.save(newTable);
      keptTableIds.add(savedTable.id);
    }

    // Process updates in two phases to avoid unique constraint conflicts during swaps
    // Phase 1: Assign temporary codes to tables that will change
    const tempUpdates = tablesToUpdate.map((item, index) => {
      const newPayload = this.buildTableSnapshotPayload(
        layoutId,
        item.incomingTable,
      );
      const codeChanged = item.existingTable.code !== newPayload.code;

      if (codeChanged) {
        return {
          table: item.existingTable,
          newPayload,
          tempCode: `__TEMP_${index}_${Date.now()}__`,
          finalCode: newPayload.code,
        };
      }

      return {
        table: item.existingTable,
        newPayload,
        tempCode: null,
        finalCode: newPayload.code,
      };
    });

    // Phase 1: Update with temporary codes for tables that will change
    for (const update of tempUpdates) {
      if (update.tempCode) {
        update.table.code = update.tempCode;
        await tableRepository.save(update.table);
      }
    }

    // Phase 2: Update with final codes
    for (const update of tempUpdates) {
      Object.assign(update.table, update.newPayload);
      await tableRepository.save(update.table);
    }

    const tablesToRemove = existingTables.filter(
      (table) => !keptTableIds.has(table.id),
    );

    if (tablesToRemove.length > 0) {
      await tableRepository.remove(tablesToRemove);
    }
  }

  private assertIncomingCodeNotDuplicated(
    code: string,
    seenIncomingCodes: Set<string>,
  ): void {
    if (seenIncomingCodes.has(code)) {
      throw new BadRequestException(
        `Mesa con codigo ${code} duplicada en el payload`,
      );
    }

    seenIncomingCodes.add(code);
  }

  private resolveSnapshotTableReference(
    incomingTable: SaveLayoutTableDto,
    existingTablesById: Map<string, RestaurantTable>,
    existingTablesByCode: Map<string, RestaurantTable>,
  ): {
    existingTable?: RestaurantTable;
    hasUuidId: boolean;
    incomingId?: string;
  } {
    const incomingId = incomingTable.id?.trim();
    const hasUuidId = Boolean(incomingId && isUUID(incomingId));
    let existingTable: RestaurantTable | undefined;

    if (hasUuidId && incomingId) {
      existingTable = existingTablesById.get(incomingId);
    }

    existingTable ??= existingTablesByCode.get(incomingTable.code);

    return {
      existingTable,
      hasUuidId,
      incomingId,
    };
  }

  private buildTableSnapshotPayload(
    layoutId: string,
    table: SaveLayoutTableDto,
  ): Partial<RestaurantTable> {
    return {
      layoutId,
      code: table.code,
      label: table.label ?? null,
      capacity: table.capacity ?? 4,
      positionX: table.positionX,
      positionY: table.positionY,
      width: table.width ?? 110,
      height: table.height ?? 110,
      rotation: table.rotation ?? 0,
      status: table.status ?? TableStatus.AVAILABLE,
    };
  }

  private handleDatabaseError(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const driverError = error.driverError as { code?: string };

      if (driverError?.code === '23505') {
        throw new ConflictException(
          'Ya existe una mesa con ese codigo dentro del layout',
        );
      }

      if (driverError?.code === '23503') {
        throw new ConflictException(
          'No se puede eliminar la mesa porque tiene ordenes asociadas',
        );
      }
    }

    throw error;
  }
}
