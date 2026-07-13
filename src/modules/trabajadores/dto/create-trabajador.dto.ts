import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTrabajadorDto {
  @IsUUID()
  userId: string;

  @IsString()
  @MaxLength(20)
  rut: string;

  @IsString()
  @MaxLength(80)
  comuna: string;

  @IsString()
  @MaxLength(120)
  direccion: string;

  @IsString()
  @MaxLength(20)
  telefono: string;

  @IsDateString()
  fechaNacimiento: string;

  @IsInt()
  @Min(0)
  edad: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sueldo: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fotoUrl?: string;
}
