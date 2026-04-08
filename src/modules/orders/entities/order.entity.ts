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
import { RestaurantTable } from '../../layouts/entities/restaurant-table.entity';
import { Reservation } from '../../reservations/entities/reservation.entity';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  SERVED = 'SERVED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tableId: string | null;

  @ManyToOne(() => RestaurantTable, (table) => table.orders, {
    onDelete: 'RESTRICT',
    eager: true,
    nullable: true,
  })
  @JoinColumn({ name: 'tableId' })
  table: RestaurantTable | null;

  @Column({ nullable: true })
  reservationId: string | null;

  @ManyToOne(() => Reservation, {
    onDelete: 'SET NULL',
    eager: true,
    nullable: true,
  })
  @JoinColumn({ name: 'reservationId' })
  reservation: Reservation | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.OPEN,
  })
  status: OrderStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'int', default: 1 })
  peopleCount: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  total: number;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.order, {
    cascade: true,
    eager: true,
  })
  items: OrderItem[];

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
