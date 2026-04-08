import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReservationDto {
  @IsUUID()
  tableId: string;

  @Type(() => Date)
  @IsDate()
  reservedFor: Date;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  peopleCount: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  holderName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  guestNames?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(600)
  notes?: string;
}
