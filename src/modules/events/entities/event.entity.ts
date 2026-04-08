import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EventTicket } from './event-ticket.entity';
import { EventTicketType } from './event-ticket-type.entity';

export enum EventStatus {
  ENABLED = 'ENABLED',
  CANCELLED = 'CANCELLED',
  SUSPENDED = 'SUSPENDED',
  RESCHEDULED = 'RESCHEDULED',
}

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'timestamptz' })
  startsAt!: Date;

  @Column({ type: 'timestamptz' })
  endsAt!: Date;

  @Column({ type: 'varchar', length: 600, nullable: true })
  officialImageUrl!: string | null;

  @Column({
    type: 'enum',
    enum: EventStatus,
    default: EventStatus.ENABLED,
  })
  status!: EventStatus;

  @Column({ type: 'int', default: 0 })
  totalTickets!: number;

  @Column({ type: 'int', default: 0 })
  soldTickets!: number;

  @Column({ type: 'boolean', default: false })
  isFreeEntry!: boolean;

  @OneToMany(() => EventTicketType, (ticketType) => ticketType.event)
  ticketTypes!: EventTicketType[];

  @OneToMany(() => EventTicket, (ticket) => ticket.event)
  tickets!: EventTicket[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
