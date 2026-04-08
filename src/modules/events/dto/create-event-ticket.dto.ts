import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsDate,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class EventTicketMenuSelectionGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  groupKey!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  optionIds!: string[];
}

export class EventTicketMenuSelectionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EventTicketMenuSelectionGroupDto)
  groups!: EventTicketMenuSelectionGroupDto[];
}

export class CreateEventTicketDto {
  @IsUUID()
  ticketTypeId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  attendeeFirstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  attendeeLastName!: string;

  @Type(() => Date)
  @IsDate()
  attendanceDate!: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  includesDetails?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  applyPromotion?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => EventTicketMenuSelectionDto)
  menuSelection?: EventTicketMenuSelectionDto;
}
