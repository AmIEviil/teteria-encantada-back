import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Event } from './event.entity';
import { EventSessionTicketAllocation } from './event-session-ticket-allocation.entity';

@Entity('event_sessions')
@Unique('UQ_event_session_slot', ['eventId', 'date', 'startTime'])
export class EventSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  eventId!: string;

  @ManyToOne(() => Event, (event) => event.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event!: Event;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'varchar', length: 5 })
  startTime!: string;

  @Column({ type: 'varchar', length: 5, nullable: true })
  endTime!: string | null;

  @Column({ type: 'int' })
  capacity!: number;

  @OneToMany(
    () => EventSessionTicketAllocation,
    (allocation) => allocation.session,
    { cascade: true },
  )
  allocations!: EventSessionTicketAllocation[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
