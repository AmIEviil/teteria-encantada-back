import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RestaurantTable } from '../../layouts/entities/restaurant-table.entity';

export enum ReservationStatus {
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

@Entity('reservations')
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tableId: string;

  @ManyToOne(() => RestaurantTable, {
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'tableId' })
  table: RestaurantTable;

  @Column({ type: 'timestamptz' })
  reservedFor: Date;

  @Column({ type: 'timestamptz', nullable: true })
  waitingUntil: Date | null;

  @Column({ type: 'int', default: 1 })
  peopleCount: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  holderName: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 25, nullable: true })
  phone: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  guestNames: string[];

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    type: 'enum',
    enum: ReservationStatus,
    default: ReservationStatus.ACTIVE,
  })
  status: ReservationStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
