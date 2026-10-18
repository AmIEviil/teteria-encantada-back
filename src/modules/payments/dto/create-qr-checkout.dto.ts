import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  ValidateNested,
} from 'class-validator';
import { PayItemDto } from './pay-event.dto';

// Reusa PayItemDto: el QR cobra exactamente los mismos items que el flujo
// público, sólo cambia quién inicia el cobro.
export class CreateQrCheckoutDto {
  @IsEmail()
  buyerEmail!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PayItemDto)
  items!: PayItemDto[];
}
