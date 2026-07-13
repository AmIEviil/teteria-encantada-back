import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsNumber,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateTrabajadorDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rut?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  comuna?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @IsOptional()
  @IsDateString()
  fechaNacimiento?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  edad?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sueldo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fotoUrl?: string;
}
