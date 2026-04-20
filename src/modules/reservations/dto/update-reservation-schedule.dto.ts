import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class UpdateReservationScheduleDayDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @Type(() => Boolean)
  @IsBoolean()
  isOpen: boolean;

  @IsOptional()
  @IsString()
  @Matches(HH_MM_PATTERN)
  opensAt?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HH_MM_PATTERN)
  closesAt?: string | null;
}

export class UpdateReservationScheduleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => UpdateReservationScheduleDayDto)
  days: UpdateReservationScheduleDayDto[];
}
