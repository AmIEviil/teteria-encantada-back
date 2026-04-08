import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumQuantity: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  currentQuantity: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  maximumQuantity: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
