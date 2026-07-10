import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { EventSession } from './event-session.entity';
import { EventTicketType } from './event-ticket-type.entity';

@Entity('event_session_ticket_allocations')
@Unique('UQ_session_ticket_type', ['sessionId', 'ticketTypeId'])
export class EventSessionTicketAllocation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  sessionId!: string;

  @ManyToOne(() => EventSession, (session) => session.allocations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session!: EventSession;

  @Column()
  ticketTypeId!: string;

  @ManyToOne(() => EventTicketType, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketTypeId' })
  ticketType!: EventTicketType;

  @Column({ type: 'int' })
  quantity!: number;
}
