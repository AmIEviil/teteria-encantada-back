import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { EventTicketStatus } from '../entities/event-ticket.entity';

export class FindEventTicketsDto {
  @IsOptional()
  @IsUUID()
  ticketTypeId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  attendanceDate?: Date;

  @IsOptional()
  @IsEnum(EventTicketStatus)
  status?: EventTicketStatus;
}
