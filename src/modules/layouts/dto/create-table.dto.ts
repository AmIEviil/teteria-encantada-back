import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { TableStatus } from '../entities/restaurant-table.entity';

export class CreateTableDto {
  @IsUUID()
  layoutId: string;

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
