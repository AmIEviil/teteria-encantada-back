import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/db/numeric.transformer';
import { Event } from './event.entity';
import { EventTicketTypeDailyStock } from './event-ticket-type-daily-stock.entity';
import { EventTicket } from './event-ticket.entity';

export enum EventTicketMenuMode {
  FIXED = 'FIXED',
  CUSTOMIZABLE = 'CUSTOMIZABLE',
}

@Entity('event_ticket_types')
export class EventTicketType {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  eventId!: string;

  @ManyToOne(() => Event, (event) => event.ticketTypes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'eventId' })
  event!: Event;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  price!: number;

  @Column({ type: 'text', nullable: true })
  includesDetails!: string | null;

  @Column({
    type: 'enum',
    enum: EventTicketMenuMode,
    default: EventTicketMenuMode.FIXED,
  })
  menuMode!: EventTicketMenuMode;

  @Column({ type: 'jsonb', nullable: true })
  menuTemplate!: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  totalStock!: number | null;

  @Column({ type: 'boolean', default: false })
  isPromotional!: boolean;

  @Column({ type: 'int', nullable: true })
  promoMinQuantity!: number | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
    nullable: true,
  })
  promoBundlePrice!: number | null;

  @OneToMany(
    () => EventTicketTypeDailyStock,
    (dailyStock) => dailyStock.ticketType,
    {
      cascade: true,
    },
  )
  dailyStocks!: EventTicketTypeDailyStock[];

  @OneToMany(() => EventTicket, (ticket) => ticket.ticketType)
  tickets!: EventTicket[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
