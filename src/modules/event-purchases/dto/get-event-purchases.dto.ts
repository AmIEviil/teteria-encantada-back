import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { EventPurchaseStatus } from '../../events/entities/event-purchase.entity';

export class GetEventPurchasesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsEnum(EventPurchaseStatus)
  status?: EventPurchaseStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
