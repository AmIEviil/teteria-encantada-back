import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateTrabajadorDocumentoDto } from './create-trabajador-documento.dto';

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTrabajadorDocumentoDto)
  documentos?: CreateTrabajadorDocumentoDto[];
}