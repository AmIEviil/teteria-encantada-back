import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrderItemDto {
  @IsUUID()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOrderDto {
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  peopleCount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  reservationId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @IsNotEmpty({ each: true })
  items: CreateOrderItemDto[];
}
