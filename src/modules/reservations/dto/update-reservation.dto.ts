import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ReservationStatus } from '../entities/reservation.entity';

export class UpdateReservationDto {
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  reservedFor?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  waitingUntil?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  peopleCount?: number;

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

  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;
}
