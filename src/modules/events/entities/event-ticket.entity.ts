import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/db/numeric.transformer';
import { Event } from './event.entity';
import { EventTicketType } from './event-ticket-type.entity';

export enum EventTicketStatus {
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
}

@Entity('event_tickets')
export class EventTicket {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  eventId!: string;

  @ManyToOne(() => Event, (event) => event.tickets, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'eventId' })
  event!: Event;

  @Column()
  ticketTypeId!: string;

  @ManyToOne(() => EventTicketType, (ticketType) => ticketType.tickets, {
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'ticketTypeId' })
  ticketType!: EventTicketType;

  @Column({ type: 'varchar', length: 120 })
  attendeeFirstName!: string;

  @Column({ type: 'varchar', length: 120 })
  attendeeLastName!: string;

  @Column({ type: 'date' })
  attendanceDate!: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  price!: number;

  @Column({ type: 'text', nullable: true })
  includesDetails!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  menuSelection!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  menuSelectionSnapshot!: Record<string, unknown> | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
    default: 0,
  })
  menuExtraPrice!: number;

  @Column({
    type: 'enum',
    enum: EventTicketStatus,
    default: EventTicketStatus.ACTIVE,
  })
  status!: EventTicketStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
