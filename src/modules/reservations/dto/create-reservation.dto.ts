import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsEmail,
  IsArray,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const PHONE_PATTERN = /^(?=.*\d)[0-9+()\s-]{7,25}$/;

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
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  @Matches(PHONE_PATTERN)
  phone?: string;

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
