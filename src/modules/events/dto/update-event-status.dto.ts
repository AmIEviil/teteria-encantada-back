import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional } from 'class-validator';
import { EventStatus } from '../entities/event.entity';

export class UpdateEventStatusDto {
  @IsEnum(EventStatus)
  status!: EventStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  publishAt?: Date;
}
