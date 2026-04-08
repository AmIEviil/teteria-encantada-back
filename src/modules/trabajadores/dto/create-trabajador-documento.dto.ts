import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateTrabajadorDocumentoDto {
  @IsString()
  @MaxLength(180)
  nombreArchivo: string;

  @IsString()
  @MaxLength(255)
  rutaArchivo: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tipoMime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tamanoBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  descripcion?: string;
}