import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EventTicketStatus } from '../entities/event-ticket.entity';

export class UpdateEventTicketMenuSelectionGroupDto {
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

export class UpdateEventTicketMenuSelectionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateEventTicketMenuSelectionGroupDto)
  groups!: UpdateEventTicketMenuSelectionGroupDto[];
}

export class UpdateEventTicketDto {
  @IsOptional()
  @IsUUID()
  ticketTypeId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  attendeeFirstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  attendeeLastName?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  attendanceDate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  includesDetails?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEventTicketMenuSelectionDto)
  menuSelection?: UpdateEventTicketMenuSelectionDto;

  @IsOptional()
  @IsEnum(EventTicketStatus)
  status?: EventTicketStatus;
}
