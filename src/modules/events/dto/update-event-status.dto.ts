import { IsEnum } from 'class-validator';
import { EventStatus } from '../entities/event.entity';

export class UpdateEventStatusDto {
  @IsEnum(EventStatus)
  status!: EventStatus;
}
