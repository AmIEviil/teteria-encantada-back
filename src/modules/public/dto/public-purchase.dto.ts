import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EventTicketMenuSelectionDto } from '../../events/dto/create-event-ticket.dto';

export class PublicPurchaseItemDto {
  @IsUUID()
  ticketTypeId!: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ValidateIf((dto: PublicPurchaseItemDto) => !dto.sessionId)
  @Type(() => Date)
  @IsDate()
  attendanceDate?: Date;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  attendeeFirstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  attendeeLastName!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EventTicketMenuSelectionDto)
  menuSelection?: EventTicketMenuSelectionDto;
}

export class PublicPurchaseDto {
  @IsEmail()
  buyerEmail!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PublicPurchaseItemDto)
  items!: PublicPurchaseItemDto[];
}
