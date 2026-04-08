import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { EventTicketType } from './event-ticket-type.entity';

@Entity('event_ticket_type_daily_stocks')
@Unique('UQ_ticket_type_date', ['ticketTypeId', 'date'])
export class EventTicketTypeDailyStock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  ticketTypeId!: string;

  @ManyToOne(() => EventTicketType, (ticketType) => ticketType.dailyStocks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ticketTypeId' })
  ticketType!: EventTicketType;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'int' })
  quantity!: number;
}
