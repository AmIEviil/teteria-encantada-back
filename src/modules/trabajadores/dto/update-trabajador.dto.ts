import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsNumber,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { RUT_MESSAGE, RUT_REGEX } from '../constants/rut.constant';

export class UpdateTrabajadorDto {
  @IsOptional()
  @IsString()
  @Matches(RUT_REGEX, { message: RUT_MESSAGE })
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
