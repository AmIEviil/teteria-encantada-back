import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CreateEventPurchaseItemDto {
  @IsUUID()
  ticketTypeId!: string;

  @IsString()
  @IsNotEmpty()
  attendeeFirstName!: string;

  @IsString()
  @IsNotEmpty()
  attendeeLastName!: string;

  @IsOptional()
  @IsString()
  attendanceDate?: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  menuSelection?: Record<string, unknown>;
}

export class CreateEventPurchaseDto {
  @IsEmail()
  buyerEmail!: string;

  @IsString()
  @IsNotEmpty()
  paymentMethod!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEventPurchaseItemDto)
  items!: CreateEventPurchaseItemDto[];
}
