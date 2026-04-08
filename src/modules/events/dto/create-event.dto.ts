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
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EventStatus } from '../entities/event.entity';
import { EventTicketMenuMode } from '../entities/event-ticket-type.entity';

export class CreateEventTicketTypeDailyStockDto {
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateEventTicketMenuOptionDto {
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

export class CreateEventTicketMenuGroupDto {
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
  @Type(() => CreateEventTicketMenuOptionDto)
  options!: CreateEventTicketMenuOptionDto[];
}

export class CreateEventTicketMenuTemplateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateEventTicketMenuGroupDto)
  groups!: CreateEventTicketMenuGroupDto[];
}

export class CreateEventTicketTypeDto {
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
  @Type(() => CreateEventTicketMenuTemplateDto)
  menuTemplate?: CreateEventTicketMenuTemplateDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalStock?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEventTicketTypeDailyStockDto)
  dailyStocks?: CreateEventTicketTypeDailyStockDto[];

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

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

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

  @ValidateIf((dto: CreateEventDto) => !dto.isFreeEntry)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateEventTicketTypeDto)
  ticketTypes?: CreateEventTicketTypeDto[];
}
