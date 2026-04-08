import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TableStatus } from '../entities/restaurant-table.entity';

class LayoutGridSizeDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rows: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cols: number;
}

class LayoutChairPositionDto {
  @Type(() => Number)
  @IsNumber()
  x: number;

  @Type(() => Number)
  @IsNumber()
  y: number;
}

class LayoutChairDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @ValidateNested()
  @Type(() => LayoutChairPositionDto)
  position: LayoutChairPositionDto;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rotation?: number;
}

export class SaveLayoutTableDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @Type(() => Number)
  @IsNumber()
  positionX: number;

  @Type(() => Number)
  @IsNumber()
  positionY: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  height?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rotation?: number;

  @IsOptional()
  @IsEnum(TableStatus)
  status?: TableStatus;
}

export class SaveLayoutSnapshotDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ValidateNested()
  @Type(() => LayoutGridSizeDto)
  gridSize: LayoutGridSizeDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LayoutChairDto)
  chairs?: LayoutChairDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveLayoutTableDto)
  tables: SaveLayoutTableDto[];
}
