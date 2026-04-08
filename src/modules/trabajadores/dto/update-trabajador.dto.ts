import { Type } from 'class-transformer';
import {
	IsArray,
	IsDateString,
	IsInt,
	IsOptional,
	IsNumber,
	IsString,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import { CreateTrabajadorDocumentoDto } from './create-trabajador-documento.dto';

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

	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => CreateTrabajadorDocumentoDto)
	documentos?: CreateTrabajadorDocumentoDto[];
}