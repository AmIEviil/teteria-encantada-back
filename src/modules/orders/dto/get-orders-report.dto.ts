import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { OrderStatus } from '../entities/order.entity';

export enum OrderReportSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  STATUS = 'status',
  PEOPLE_COUNT = 'peopleCount',
  TOTAL = 'total',
  TABLE = 'table',
}

export enum OrderReportOrderDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class GetOrdersReportDto {
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(OrderReportSortBy)
  orderBy?: OrderReportSortBy;

  @IsOptional()
  @IsEnum(OrderReportOrderDirection)
  orderDirection?: OrderReportOrderDirection;
}
