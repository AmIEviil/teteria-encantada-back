import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EventStatus } from '../entities/event.entity';
import { EventTicketMenuMode } from '../entities/event-ticket-type.entity';

const SESSION_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateEventSessionAllocationDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ticketTypeIndex!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class UpdateEventSessionDto {
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @IsString()
  @Matches(SESSION_TIME_PATTERN, {
    message: 'La hora de inicio de la jornada debe tener formato HH:mm',
  })
  startTime!: string;

  @IsOptional()
  @IsString()
  @Matches(SESSION_TIME_PATTERN, {
    message: 'La hora de termino de la jornada debe tener formato HH:mm',
  })
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateEventSessionAllocationDto)
  allocations?: UpdateEventSessionAllocationDto[];
}

export class UpdateEventTicketTypeDailyStockDto {
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class UpdateEventTicketMenuOptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  extraPrice?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEventTicketMenuGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSelect?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxSelect?: number;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UpdateEventTicketMenuOptionDto)
  options!: UpdateEventTicketMenuOptionDto[];
}

export class UpdateEventTicketMenuTemplateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateEventTicketMenuGroupDto)
  groups!: UpdateEventTicketMenuGroupDto[];
}

export class UpdateEventTicketTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  includesDetails?: string;

  @IsOptional()
  @IsEnum(EventTicketMenuMode)
  menuMode?: EventTicketMenuMode;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEventTicketMenuTemplateDto)
  menuTemplate?: UpdateEventTicketMenuTemplateDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalStock?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateEventTicketTypeDailyStockDto)
  dailyStocks?: UpdateEventTicketTypeDailyStockDto[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPromotional?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  promoMinQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  promoBundlePrice?: number;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  officialImageUrl?: string;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isFreeEntry?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isWorkshop?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  workshopPoints?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateEventTicketTypeDto)
  ticketTypes?: UpdateEventTicketTypeDto[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hasSessions?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateEventSessionDto)
  sessions?: UpdateEventSessionDto[];
}
