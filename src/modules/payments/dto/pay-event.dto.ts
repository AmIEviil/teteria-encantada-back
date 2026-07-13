import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { EventTicketMenuSelectionDto } from '../../events/dto/create-event-ticket.dto';

export class PayItemDto {
  @IsString()
  @IsNotEmpty()
  ticketTypeId!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @Type(() => Date)
  attendanceDate?: Date;

  @IsString()
  @IsNotEmpty()
  attendeeFirstName!: string;

  @IsString()
  @IsNotEmpty()
  attendeeLastName!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EventTicketMenuSelectionDto)
  menuSelection?: EventTicketMenuSelectionDto;
}

export class PaymentDetailsDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsInt()
  @Min(1)
  installments!: number;

  @IsString()
  @IsNotEmpty()
  paymentMethodId!: string;

  @IsOptional()
  @IsString()
  issuerId?: string;
}

export class PayEventDto {
  @IsEmail()
  buyerEmail!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayItemDto)
  items!: PayItemDto[];

  @ValidateNested()
  @Type(() => PaymentDetailsDto)
  payment!: PaymentDetailsDto;
}
