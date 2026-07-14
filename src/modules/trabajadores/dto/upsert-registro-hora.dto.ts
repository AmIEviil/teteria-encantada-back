import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';

export function IsMediaHora(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isMediaHora',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'number' && Number.isInteger(value * 2);
        },
        defaultMessage(): string {
          return 'Las horas deben ser múltiplos de 0.5';
        },
      },
    });
  };
}

export class UpsertRegistroHoraDto {
  @IsOptional()
  @IsUUID()
  trabajadorId?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener formato YYYY-MM-DD',
  })
  @IsDateString(
    { strict: true },
    { message: 'La fecha debe ser una fecha calendario válida' },
  )
  fecha: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  @IsMediaHora()
  horas: number;
}
